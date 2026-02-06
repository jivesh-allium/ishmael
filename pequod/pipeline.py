"""Core orchestration: poll -> enrich -> filter -> dedup -> format -> send."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from pequod.broadcaster import TelegramBroadcaster
from pequod.client import AlliumClient
from pequod.dedup import DedupStore, make_dedup_key
from pequod.enricher import PriceMap, build_price_map, get_usd_value
from pequod.formatter import format_alert
from pequod.geo import GeoMap
from pequod.models import (
    AssetBridgeActivity,
    DexTradeActivity,
    EVMTransfer,
    SolanaTransfer,
    WalletTransaction,
    WhaleAlert,
)
from pequod.watchlist import Watchlist

if TYPE_CHECKING:
    from pequod.label_registry import LabelRegistry

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared alert buffer + WebSocket broadcast queue
# ---------------------------------------------------------------------------

# Recent alerts buffer (last 1000) — read by REST endpoints
alert_buffer: deque[dict] = deque(maxlen=1000)

# Queue for broadcasting to WebSocket clients — written by pipeline, read by WS endpoint
ws_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=5000)

# Reference to loaded GeoMap — set by server startup
geo_map: GeoMap | None = None

# Reference to LabelRegistry — set by server startup
label_registry: LabelRegistry | None = None

# ---------------------------------------------------------------------------
# Discovered addresses — non-watchlist addresses seen in whale alerts
# ---------------------------------------------------------------------------

MAX_DISCOVERED = 500

# address_lower → {address, chain, label, total_usd, count}
discovered_addresses: dict[str, dict] = {}


def _track_discovered(alert: WhaleAlert, watchlist: Watchlist) -> None:
    """Record non-watchlist addresses from whale alerts for map discovery."""
    candidates = [
        (alert.from_address, alert.from_label, alert.chain),
        (alert.to_address, alert.to_label, alert.chain),
    ]
    for addr, lbl, chain in candidates:
        if not addr:
            continue
        # Skip if already in watchlist
        if watchlist.get_label(addr, chain):
            continue
        key = addr.lower()
        if key in discovered_addresses:
            entry = discovered_addresses[key]
            entry["total_usd"] += alert.usd_value
            entry["count"] += 1
            if lbl and not entry.get("label"):
                entry["label"] = lbl
        else:
            discovered_addresses[key] = {
                "address": addr,
                "chain": chain,
                "label": lbl,
                "total_usd": alert.usd_value,
                "count": 1,
            }

    # Evict lowest-volume entries if over cap
    if len(discovered_addresses) > MAX_DISCOVERED:
        by_volume = sorted(discovered_addresses, key=lambda k: discovered_addresses[k]["total_usd"])
        for k in by_volume[: len(discovered_addresses) - MAX_DISCOVERED]:
            del discovered_addresses[k]


def _alert_to_dict(alert: WhaleAlert) -> dict:
    """Convert WhaleAlert to a JSON-serializable dict with geo data."""
    d = alert.model_dump(mode="json")
    # Enrich with geo coordinates
    if geo_map:
        if alert.from_address:
            from_geo = geo_map.get(alert.from_address)
            d["from_lat"] = from_geo["lat"]
            d["from_lon"] = from_geo["lon"]
            d["from_country"] = from_geo.get("country")
        if alert.to_address:
            to_geo = geo_map.get(alert.to_address)
            d["to_lat"] = to_geo["lat"]
            d["to_lon"] = to_geo["lon"]
            d["to_country"] = to_geo.get("country")
    return d


def _determine_alert_type(xfer: EVMTransfer | SolanaTransfer) -> str:
    """Classify a transfer as transfer/mint/burn."""
    if isinstance(xfer, EVMTransfer):
        if xfer.operation == "mint":
            return "mint"
        if xfer.operation == "burn":
            return "burn"
    elif isinstance(xfer, SolanaTransfer):
        if xfer.transfer_type == "minted":
            return "mint"
        if xfer.transfer_type == "burned":
            return "burn"
    return "transfer"


def _get_label(address: str | None, chain: str, watchlist: Watchlist) -> str | None:
    """Look up a label using label_registry (if available) or watchlist fallback."""
    if not address:
        return None
    if label_registry:
        return label_registry.get_label(address, chain)
    return watchlist.get_label(address, chain)


def extract_alerts(
    tx: WalletTransaction,
    price_map: PriceMap,
    watchlist: Watchlist,
) -> list[WhaleAlert]:
    """Parse a single transaction into typed WhaleAlert objects."""
    alerts: list[WhaleAlert] = []

    # --- Asset transfers ---
    for xfer in tx.asset_transfers:
        if not isinstance(xfer, (EVMTransfer, SolanaTransfer)):
            # Bitcoin transfers — simplified handling
            continue

        amount = xfer.amount.amount
        usd = get_usd_value(xfer.asset, amount, tx.chain, price_map)
        alert_type = _determine_alert_type(xfer)

        from_addr = getattr(xfer, "from_address", None)
        to_addr = getattr(xfer, "to_address", None)

        alerts.append(
            WhaleAlert(
                tx_hash=tx.hash,
                chain=tx.chain,
                block_timestamp=tx.block_timestamp,
                alert_type=alert_type,
                from_address=from_addr,
                to_address=to_addr,
                from_label=_get_label(from_addr, tx.chain, watchlist),
                to_label=_get_label(to_addr, tx.chain, watchlist),
                asset_symbol=xfer.asset.symbol,
                amount=amount,
                usd_value=usd,
            )
        )

    # --- Activities ---
    for act in tx.activities:
        if isinstance(act, DexTradeActivity):
            # Use the larger side for USD value
            usd_bought = get_usd_value(
                act.asset_bought, act.amount_bought.amount, tx.chain, price_map
            )
            usd_sold = get_usd_value(
                act.asset_sold, act.amount_sold.amount, tx.chain, price_map
            )
            usd = max(usd_bought, usd_sold)

            alerts.append(
                WhaleAlert(
                    tx_hash=tx.hash,
                    chain=tx.chain,
                    block_timestamp=tx.block_timestamp,
                    alert_type="dex_trade",
                    from_address=tx.from_address,
                    to_address=tx.to_address,
                    from_label=_get_label(tx.from_address, tx.chain, watchlist),
                    to_label=_get_label(tx.to_address, tx.chain, watchlist),
                    asset_bought_symbol=act.asset_bought.symbol,
                    asset_sold_symbol=act.asset_sold.symbol,
                    amount_bought=act.amount_bought.amount,
                    amount_sold=act.amount_sold.amount,
                    usd_value=usd,
                    protocol=act.protocol or act.project,
                )
            )

        elif isinstance(act, AssetBridgeActivity):
            usd = get_usd_value(
                act.token_in_asset, act.token_in_amount.amount, tx.chain, price_map
            )

            alerts.append(
                WhaleAlert(
                    tx_hash=tx.hash,
                    chain=tx.chain,
                    block_timestamp=tx.block_timestamp,
                    alert_type="bridge",
                    from_address=act.sender_address,
                    to_address=act.recipient_address,
                    from_label=_get_label(act.sender_address, tx.chain, watchlist),
                    to_label=_get_label(act.recipient_address, tx.chain, watchlist),
                    asset_symbol=act.token_in_asset.symbol,
                    amount=act.token_in_amount.amount,
                    usd_value=usd,
                    protocol=act.protocol,
                    source_chain=act.source_chain,
                    destination_chain=act.destination_chain,
                )
            )

    return alerts


async def process_batch(
    client: AlliumClient,
    batch: list[dict[str, str]],
    watchlist: Watchlist,
    dedup: DedupStore,
    threshold: float,
    broadcaster: TelegramBroadcaster,
    lookback_days: int = 1,
) -> int:
    """Process a single batch of addresses. Returns count of alerts sent."""
    # 1. Fetch transactions
    resp = await client.get_wallet_transactions(batch, lookback_days=lookback_days)
    if not resp.items:
        return 0

    # 2. Fetch prices for all tokens in this batch
    price_map = await build_price_map(client, resp.items)

    # 3-6. Extract → filter → dedup → format → send
    sent = 0
    for tx in resp.items:
        alerts = extract_alerts(tx, price_map, watchlist)
        for alert in alerts:
            # Threshold filter
            if alert.usd_value < threshold:
                continue

            # Dedup
            key = make_dedup_key(alert.tx_hash, alert.alert_type, alert.asset_symbol)
            if await dedup.is_seen(key):
                continue
            await dedup.mark_seen(key)

            # Track non-watchlist counterparties for map discovery
            _track_discovered(alert, watchlist)

            # Format & send to Telegram
            message = format_alert(alert)
            await broadcaster.send_alert(message)

            # Publish to alert buffer + WebSocket queue
            alert_dict = _alert_to_dict(alert)
            alert_buffer.appendleft(alert_dict)
            try:
                ws_queue.put_nowait(alert_dict)
            except asyncio.QueueFull:
                logger.warning("WebSocket queue full, dropping oldest alert")
                try:
                    ws_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                ws_queue.put_nowait(alert_dict)

            sent += 1
            logger.info(
                "Alert sent: %s %s %.0f USD on %s",
                alert.alert_type,
                alert.asset_symbol,
                alert.usd_value,
                alert.chain,
            )

    return sent
