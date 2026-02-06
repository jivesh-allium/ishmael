"""REST + WebSocket endpoints for the Pequod frontend."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from pequod import pipeline
from pequod.geo import GeoMap
from pequod.label_registry import LabelRegistry
from pequod.watchlist import Watchlist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# References set by server startup
_watchlist: Watchlist | None = None
_geo_map: GeoMap | None = None
_label_registry: LabelRegistry | None = None


def configure(
    watchlist: Watchlist,
    geo_map: GeoMap,
    label_registry: LabelRegistry | None = None,
) -> None:
    """Inject shared state from server startup."""
    global _watchlist, _geo_map, _label_registry
    _watchlist = watchlist
    _geo_map = geo_map
    _label_registry = label_registry


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
