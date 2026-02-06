"""Async Allium API client wrapping httpx."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

from pequod.models import PricesResponse, TransactionsResponse

logger = logging.getLogger(__name__)

BASE_URL = "https://api.allium.so/api/v1/developer"
MAX_RETRIES = 2
RETRY_BACKOFF = 2.0  # seconds, doubled each retry


class AlliumClient:
    """Thin async wrapper around Allium's REST API."""

    def __init__(self, api_key: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            headers={"X-API-KEY": api_key},
            timeout=30.0,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def get_wallet_transactions(
        self,
        addresses: list[dict[str, str]],
        limit: int = 100,
        lookback_days: int = 1,
    ) -> TransactionsResponse:
        """Fetch transactions for a batch of addresses (max 20 per request).

        Args:
            addresses: list of {"chain": ..., "address": ...} dicts.
            limit: max transactions to return (API max 1000).
            lookback_days: only return txs newer than this many days ago.
        """
        last_exc: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            resp = await self._client.post(
                "/wallet/transactions",
                params={"limit": limit},
                json=addresses,
            )
            if resp.status_code < 500:
                break
            last_exc = httpx.HTTPStatusError(
                f"Server error {resp.status_code}", request=resp.request, response=resp,
            )
            if attempt < MAX_RETRIES:
                wait = RETRY_BACKOFF * (2 ** attempt)
                logger.warning(
                    "Allium 5xx (%s), retrying in %.0fs (attempt %d/%d)",
                    resp.status_code, wait, attempt + 1, MAX_RETRIES,
                )
                await asyncio.sleep(wait)
            else:
                raise last_exc
        resp.raise_for_status()
        data = resp.json()
        parsed = TransactionsResponse.model_validate(data)

        # Client-side filter by lookback window
        cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        parsed.items = [
            tx for tx in parsed.items
            if tx.block_timestamp.replace(tzinfo=timezone.utc) >= cutoff
        ]
        return parsed

    async def get_prices(
        self,
        tokens: list[dict[str, str]],
    ) -> PricesResponse:
        """Fetch latest prices for a batch of tokens (max 200 per request).

        Args:
            tokens: list of {"token_address": ..., "chain": ...} dicts.
        """
        if not tokens:
            return PricesResponse()

        resp = await self._client.post(
            "/prices",
            json=tokens,
        )
        resp.raise_for_status()
        return PricesResponse.model_validate(resp.json())
