"""Deduplication stores — Redis-backed or in-memory fallback."""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

# TTL for dedup entries (48 hours)
DEDUP_TTL_SECONDS = 48 * 60 * 60


class DedupStore(ABC):
    """Protocol for dedup backends."""

    @abstractmethod
    async def is_seen(self, key: str) -> bool: ...

    @abstractmethod
    async def mark_seen(self, key: str) -> None: ...


class InMemoryDedupStore(DedupStore):
    """Dict-backed dedup with monotonic timestamps for TTL eviction."""

    def __init__(self, ttl: int = DEDUP_TTL_SECONDS) -> None:
        self._store: dict[str, float] = {}
        self._ttl = ttl

    def _evict_expired(self) -> None:
        now = time.monotonic()
        expired = [k for k, ts in self._store.items() if now - ts > self._ttl]
        for k in expired:
            del self._store[k]

    async def is_seen(self, key: str) -> bool:
        self._evict_expired()
        return key in self._store

    async def mark_seen(self, key: str) -> None:
        self._store[key] = time.monotonic()


class RedisDedupStore(DedupStore):
    """Redis SET-based dedup with TTL per key."""

    REDIS_KEY = "pequod:dedup"

    def __init__(self, redis_url: str) -> None:
        import redis.asyncio as aioredis

        self._redis = aioredis.from_url(redis_url, decode_responses=True)

    async def is_seen(self, key: str) -> bool:
        return bool(await self._redis.sismember(self.REDIS_KEY, key))

    async def mark_seen(self, key: str) -> None:
        await self._redis.sadd(self.REDIS_KEY, key)
        # Refresh TTL on the set so it doesn't grow unbounded.
        # Individual key-level TTL isn't possible with SETs, so we use
        # a sorted set approach or just expire the whole set periodically.
        # For MVP, expire the whole set — entries re-accumulate.
        await self._redis.expire(self.REDIS_KEY, DEDUP_TTL_SECONDS)


def make_dedup_key(tx_hash: str, alert_type: str, asset_symbol: str | None) -> str:
    """Build a dedup key: {tx_hash}:{alert_type}:{asset_symbol}."""
    return f"{tx_hash}:{alert_type}:{asset_symbol or 'unknown'}"


def create_dedup_store(redis_url: str | None) -> DedupStore:
    """Factory: pick implementation based on config."""
    if redis_url:
        logger.info("Using Redis dedup store at %s", redis_url)
        return RedisDedupStore(redis_url)
    logger.info("Using in-memory dedup store (no Redis configured)")
    return InMemoryDedupStore()
