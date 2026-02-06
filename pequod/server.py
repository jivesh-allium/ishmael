"""FastAPI server — serves REST API, WebSocket, and static frontend."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pequod import api_routes, pipeline
from pequod.broadcaster import TelegramBroadcaster
from pequod.client import AlliumClient
from pequod.dedup import create_dedup_store
from pequod.geo import GeoMap
from pequod.identity import IdentityClient
from pequod.label_registry import LabelRegistry
from pequod.pipeline import process_batch
from pequod.settings import Settings
from pequod.watchlist import Watchlist

logger = logging.getLogger(__name__)

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


async def _run_poller(
    settings: Settings,
    watchlist: Watchlist,
    client: AlliumClient,
    broadcaster: TelegramBroadcaster,
) -> None:
    """Polling loop (runs as a background asyncio task)."""
    dedup = create_dedup_store(settings.redis_url)
    # Exclude bitcoin — the wallet/transactions API doesn't reliably support it
    # and extract_alerts() already skips BitcoinTransfer objects.
    batches = watchlist.batches(size=20, exclude_chains=frozenset({"bitcoin"}))

    while True:
        total_sent = 0
        for i, batch in enumerate(batches):
            try:
                sent = await process_batch(
                    client=client,
                    batch=batch,
                    watchlist=watchlist,
                    dedup=dedup,
                    threshold=settings.min_usd_threshold,
                    broadcaster=broadcaster,
                    lookback_days=settings.lookback_days,
                )
                total_sent += sent
            except Exception:
                logger.exception("Error processing batch %d/%d", i + 1, len(batches))

        logger.info(
            "Cycle complete: %d alerts sent. Sleeping %ds.",
            total_sent,
            settings.poll_interval_seconds,
        )
        await asyncio.sleep(settings.poll_interval_seconds)


async def _fetch_identity(
    settings: Settings,
) -> list:
    """Fetch identity entities from Allium with timeout. Returns [] on failure."""
    if not settings.enable_identity_enrichment:
        logger.info("Identity enrichment disabled by config")
        return []

    identity_client = IdentityClient(settings.allium_api_key)
    try:
        entries = await asyncio.wait_for(
            identity_client.fetch_entities(),
            timeout=settings.identity_fetch_timeout,
        )
        return entries
    except asyncio.TimeoutError:
        logger.warning(
            "Identity fetch timed out after %ds, proceeding with static labels only",
            settings.identity_fetch_timeout,
        )
        return []
    except Exception:
        logger.warning("Identity fetch failed, proceeding with static labels only", exc_info=True)
        return []
    finally:
        await identity_client.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load watchlist, fetch geo + identity, start poller + WS broadcast."""
    settings = Settings()

    # Phase A: Load watchlist + create label registry
    watchlist = Watchlist.from_directory()
    label_reg = LabelRegistry(watchlist)
    logger.info("Loaded %d watchlist addresses", watchlist.total_addresses)

    # Phase A: Build geo layout (sync — no API calls) + fetch identity (async)
    geo_map = GeoMap.from_watchlist(watchlist)
    identity_entries = await _fetch_identity(settings)

    # Merge identity labels and register their geo
    if identity_entries:
        label_reg.merge_identity(identity_entries)
        geo_map.register_identity_geo(label_reg)

    # Wire shared state
    pipeline.geo_map = geo_map
    pipeline.label_registry = label_reg
    api_routes.configure(watchlist, geo_map, label_registry=label_reg)

    # Phase B: Start background tasks
    client = AlliumClient(settings.allium_api_key)
    broadcaster = TelegramBroadcaster(settings.telegram_bot_token, settings.telegram_chat_id)

    poller_task = asyncio.create_task(_run_poller(settings, watchlist, client, broadcaster))
    ws_broadcast_task = asyncio.create_task(api_routes.broadcast_loop())

    logger.info("Pequod server started — poller and WebSocket broadcast running")

    yield

    # Shutdown
    poller_task.cancel()
    ws_broadcast_task.cancel()
    await client.close()
    await broadcaster.close()
    logger.info("Pequod server stopped")


def create_app() -> FastAPI:
    """Build and return the FastAPI application."""
    app = FastAPI(
        title="Pequod — Whale Explorer",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS for dev (Vite on :5173)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(api_routes.router)

    # Serve frontend static files if built
    if FRONTEND_DIST.exists():
        app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

    return app


app = create_app()
