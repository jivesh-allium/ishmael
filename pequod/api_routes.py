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

# References set by server startup
_watchlist: Watchlist | None = None
_geo_map: GeoMap | None = None
_label_registry: LabelRegistry | None = None
_client: AlliumClient | None = None
_min_usd_threshold: float = 1_000_000

# Simple cache for history endpoint: (lookback_minutes, fetched_at, alerts)
_history_cache: dict[int, tuple[float, list[dict]]] = {}
_HISTORY_CACHE_TTL = 60  # seconds


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
    batches = _watchlist.batches(size=20, exclude_chains=frozenset({"bitcoin"}))

    # Fetch all batches concurrently (semaphore to limit to 4 parallel)
    sem = asyncio.Semaphore(4)
    all_alerts: list[dict] = []

    # Max pages to paginate per batch (to avoid runaway fetches)
    max_pages = 3 if lookback_minutes <= 60 else 5

    async def fetch_batch(batch: list[dict[str, str]]) -> list[dict]:
        async with sem:
            try:
                all_txs = []
                cursor = None
                for _page in range(max_pages):
                    resp = await _client.get_wallet_transactions(
                        batch, limit=200, lookback_days=lookback_days, cursor=cursor,
                    )
                    all_txs.extend(resp.items)
                    if not resp.cursor or not resp.items:
                        break
                    cursor = resp.cursor

                if not all_txs:
                    return []
                price_map = await build_price_map(_client, all_txs)
                alerts = []
                for tx in all_txs:
                    for alert in extract_alerts(tx, price_map, _watchlist):
                        if alert.usd_value < _min_usd_threshold:
                            continue
                        alerts.append(pipeline._alert_to_dict(alert))
                return alerts
            except Exception:
                logger.exception("History fetch failed for batch")
                return []

    results = await asyncio.gather(*(fetch_batch(b) for b in batches))
    for batch_alerts in results:
        all_alerts.extend(batch_alerts)

    # Precise time cutoff (lookback_days is coarse, filter to exact minutes)
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)
    filtered = []
    seen_keys: set[str] = set()
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
                continue
        except (ValueError, TypeError):
            pass
        filtered.append(a)

    # Sort by timestamp descending
    filtered.sort(key=lambda a: a.get("block_timestamp", ""), reverse=True)

    # Cache result
    _history_cache[lookback_minutes] = (now, filtered)

    return {"alerts": filtered, "total": len(filtered), "cached": False}


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
