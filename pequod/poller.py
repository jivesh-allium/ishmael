"""Infinite polling loop that drives the pipeline."""

from __future__ import annotations

import asyncio
import logging

from pequod.broadcaster import TelegramBroadcaster
from pequod.client import AlliumClient
from pequod.dedup import create_dedup_store
from pequod.pipeline import process_batch
from pequod.settings import Settings
from pequod.watchlist import Watchlist

logger = logging.getLogger(__name__)


async def run_poller(settings: Settings) -> None:
    """Run the whale alert poller forever."""
    watchlist = Watchlist.from_directory()
    batches = watchlist.batches(size=20)
    logger.info(
        "Loaded %d addresses in %d batches",
        watchlist.total_addresses,
        len(batches),
    )

    dedup = create_dedup_store(settings.redis_url)
    client = AlliumClient(settings.allium_api_key)
    broadcaster = TelegramBroadcaster(settings.telegram_bot_token, settings.telegram_chat_id)

    try:
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
    finally:
        await client.close()
        await broadcaster.close()
