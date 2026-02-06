"""REST + WebSocket endpoints for the Pequod frontend."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from pequod import pipeline
from pequod.client import AlliumClient
from pequod.enricher import build_price_map
from pequod.geo import GeoMap
from pequod.label_registry import LabelRegistry
from pequod.pipeline import extract_alerts
from pequod.watchlist import Watchlist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/health")
async def health():
    return {"status": "ok"}


# References set by server startup
_watchlist: Watchlist | None = None
_geo_map: GeoMap | None = None
_label_registry: LabelRegistry | None = None
_client: AlliumClient | None = None
_min_usd_threshold: float = 1_000_000

# Simple cache for history endpoint: (lookback_minutes, fetched_at, alerts)
_history_cache: dict[int, tuple[float, list[dict]]] = {}
_HISTORY_CACHE_TTL = 60  # seconds

# Price history cache: (symbol, hours) -> (fetched_at, response_data)
_price_cache: dict[tuple[str, int], tuple[float, list[dict]]] = {}
_PRICE_CACHE_TTL = 300  # 5 minutes

# Well-known token symbol -> (address, chain)
_SYMBOL_MAP: dict[str, tuple[str, str]] = {
    "ETH": ("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "ethereum"),
    "WETH": ("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "ethereum"),
    "BTC": ("0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", "ethereum"),
    "WBTC": ("0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", "ethereum"),
    "USDC": ("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "ethereum"),
    "USDT": ("0xdac17f958d2ee523a2206206994597c13d831ec7", "ethereum"),
    "SOL": ("So11111111111111111111111111111111111111112", "solana"),
    "WSOL": ("So11111111111111111111111111111111111111112", "solana"),
}


def configure(
    watchlist: Watchlist,
    geo_map: GeoMap,
    label_registry: LabelRegistry | None = None,
    client: AlliumClient | None = None,
    min_usd_threshold: float = 1_000_000,
) -> None:
    """Inject shared state from server startup."""
    global _watchlist, _geo_map, _label_registry, _client, _min_usd_threshold
    _watchlist = watchlist
    _geo_map = geo_map
    _label_registry = label_registry
    _client = client
    _min_usd_threshold = min_usd_threshold


@router.get("/map")
async def get_map():
    """All watchlist entities with labels + geo coords (the static map layer).

    Returns islands: known entities grouped by label, with their geo position.
    """
    if not _watchlist or not _geo_map:
        return {"entities": []}

    # Group addresses by label to create "islands"
    label_groups: dict[str, dict] = {}
    for entry in _watchlist.all_entries():
        addr = entry["address"]
        chain = entry["chain"]
        if _label_registry:
            label = _label_registry.get_label(addr, chain) or addr[:10]
        else:
            label = _watchlist.get_label(addr, chain) or addr[:10]
        geo = _geo_map.get(addr)

        if label not in label_groups:
            label_groups[label] = {
                "label": label,
                "addresses": [],
                "lat": geo["lat"],
                "lon": geo["lon"],
                "country": geo.get("country", "XX"),
            }
        label_groups[label]["addresses"].append({
            "address": addr,
            "chain": chain,
        })

    # Include discovered (non-watchlist) addresses from whale alerts
    for _key, info in pipeline.discovered_addresses.items():
        addr = info["address"]
        chain = info.get("chain", "ethereum")
        label = info.get("label") or f"{addr[:6]}...{addr[-4:]}"
        if label in label_groups:
            continue
        geo = _geo_map.get(addr)
        label_groups[label] = {
            "label": label,
            "addresses": [{"address": addr, "chain": chain}],
            "lat": geo["lat"],
            "lon": geo["lon"],
            "country": geo.get("country", "XX"),
            "discovered": True,
        }

    return {"entities": list(label_groups.values())}


@router.get("/whales")
async def get_whales(limit: int = 100):
    """Recent whale alerts with geo coordinates."""
    alerts = list(pipeline.alert_buffer)[:limit]
    return {"alerts": alerts, "total": len(pipeline.alert_buffer)}


@router.get("/whale/{tx_hash}")
async def get_whale(tx_hash: str):
    """Single alert detail by tx hash."""
    for alert in pipeline.alert_buffer:
        if alert.get("tx_hash") == tx_hash:
            return {"alert": alert}
    return {"alert": None, "error": "Not found"}


@router.get("/whales/history")
async def get_whales_history(lookback_minutes: int = 60):
    """On-demand historical fetch from the Allium API.

    Fetches transactions for the full watchlist with the given lookback,
    runs through extract_alerts + enrichment, and returns the results.
    Cached for 60 seconds per lookback_minutes value.
    """
    if not _client or not _watchlist:
        return {"alerts": [], "error": "Server not ready"}

    lookback_minutes = max(5, min(lookback_minutes, 1440))

    # Check cache
    now = time.time()
    if lookback_minutes in _history_cache:
        cached_at, cached_alerts = _history_cache[lookback_minutes]
        if now - cached_at < _HISTORY_CACHE_TTL:
            return {"alerts": cached_alerts, "total": len(cached_alerts), "cached": True}

    lookback_days = max(1, math.ceil(lookback_minutes / 1440))
    batch_list = _watchlist.batches(size=20, exclude_chains=frozenset({"bitcoin"}))

    all_alerts: list[dict] = []
    debug: dict = {"batches": len(batch_list), "errors": [], "tx_count": 0,
                   "raw_alerts": 0, "below_threshold": 0}

    # Max pages to paginate per batch (to avoid runaway fetches)
    max_pages = 3 if lookback_minutes <= 60 else 5

    logger.info(
        "History fetch: lookback=%dm, %d batches, max_pages=%d",
        lookback_minutes, len(batch_list), max_pages,
    )

    # Process batches sequentially with delay to respect API rate limits
    for batch_idx, batch in enumerate(batch_list):
        if batch_idx > 0:
            await asyncio.sleep(1.5)  # stay under rate limit

        all_txs = []
        cursor = None
        try:
            for _page in range(max_pages):
                resp = await _client.get_wallet_transactions(
                    batch, limit=200, lookback_days=lookback_days, cursor=cursor,
                )
                all_txs.extend(resp.items)
                if not resp.cursor or not resp.items:
                    break
                cursor = resp.cursor
                await asyncio.sleep(1.0)  # delay between pages too
        except Exception as exc:
            msg = f"TX fetch batch {batch_idx}: {exc}"
            logger.warning(msg)
            debug["errors"].append(msg)
            continue

        debug["tx_count"] += len(all_txs)
        if not all_txs:
            continue

        try:
            price_map = await build_price_map(_client, all_txs)
        except Exception as exc:
            msg = f"Price fetch batch {batch_idx}: {exc}"
            logger.warning(msg)
            debug["errors"].append(msg)
            price_map = {}

        for tx in all_txs:
            for alert in extract_alerts(tx, price_map, _watchlist):
                debug["raw_alerts"] += 1
                if alert.usd_value < _min_usd_threshold:
                    debug["below_threshold"] += 1
                    continue
                all_alerts.append(pipeline._alert_to_dict(alert))
    logger.info(
        "History fetch: %d alerts passed threshold (txs=%d, raw_alerts=%d, below=%d, errors=%d)",
        len(all_alerts), debug["tx_count"], debug["raw_alerts"],
        debug["below_threshold"], len(debug["errors"]),
    )

    # Precise time cutoff (lookback_days is coarse, filter to exact minutes)
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)
    filtered = []
    seen_keys: set[str] = set()
    cutoff_dropped = 0
    for a in all_alerts:
        # Dedup by tx_hash + alert_type
        key = f"{a.get('tx_hash')}:{a.get('alert_type')}:{a.get('asset_symbol')}"
        if key in seen_keys:
            continue
        seen_keys.add(key)
        ts_str = a.get("block_timestamp", "")
        if not (ts_str.endswith("Z") or "+" in ts_str):
            ts_str += "Z"
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            if ts < cutoff:
                cutoff_dropped += 1
                continue
        except (ValueError, TypeError):
            pass
        filtered.append(a)

    # Sort by timestamp descending
    filtered.sort(key=lambda a: a.get("block_timestamp", ""), reverse=True)
    debug["cutoff_dropped"] = cutoff_dropped
    debug["final"] = len(filtered)

    # Only cache non-empty results
    if filtered:
        _history_cache[lookback_minutes] = (now, filtered)

    return {"alerts": filtered, "total": len(filtered), "cached": False, "debug": debug}


@router.get("/prices/history")
async def get_price_history(symbol: str = "ETH", hours: int = 24):
    """Return historical price data for a well-known token symbol."""
    symbol = symbol.upper()
    if symbol not in _SYMBOL_MAP:
        return {"symbol": symbol, "prices": [], "error": f"Unknown symbol: {symbol}"}

    hours = max(1, min(hours, 720))  # clamp 1h–30d

    # Check cache
    now = time.time()
    cache_key = (symbol, hours)
    if cache_key in _price_cache:
        cached_at, cached_prices = _price_cache[cache_key]
        if now - cached_at < _PRICE_CACHE_TTL:
            return {"symbol": symbol, "prices": cached_prices}

    if not _client:
        return {"symbol": symbol, "prices": [], "error": "Server not ready"}

    address, chain = _SYMBOL_MAP[symbol]
    granularity = "1h" if hours <= 24 else "1d"

    try:
        points = await _client.get_price_history(address, chain, hours, granularity)
        prices = [
            {
                "timestamp": p.timestamp.isoformat(),
                "price": p.price,
            }
            for p in points
        ]
        _price_cache[cache_key] = (now, prices)
        return {"symbol": symbol, "prices": prices}
    except Exception:
        logger.exception("Failed to fetch price history for %s", symbol)
        return {"symbol": symbol, "prices": [], "error": "Failed to fetch price data"}


# ---------------------------------------------------------------------------
# WebSocket: stream live alerts
# ---------------------------------------------------------------------------

_ws_clients: set[WebSocket] = set()


@router.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket):
    """Stream new whale alerts to connected clients."""
    await ws.accept()
    _ws_clients.add(ws)
    logger.info("WebSocket client connected (%d total)", len(_ws_clients))
    try:
        # Keep connection alive, send pings
        while True:
            # Wait for client messages (keepalive pings)
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send ping to keep alive
                await ws.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WebSocket error", exc_info=True)
    finally:
        _ws_clients.discard(ws)
        logger.info("WebSocket client disconnected (%d remaining)", len(_ws_clients))


async def broadcast_loop():
    """Background task: read from ws_queue and broadcast to all connected clients."""
    while True:
        alert = await pipeline.ws_queue.get()
        if not _ws_clients:
            continue
        message = json.dumps({"type": "alert", "data": alert})
        disconnected = set()
        for ws in _ws_clients:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.add(ws)
        _ws_clients.difference_update(disconnected)
