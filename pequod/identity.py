"""Allium identity enrichment — fetch labeled addresses from common.identity.entities."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

EXPLORER_BASE = "https://api.allium.so/api/v1/explorer"

DEFAULT_CHAINS = ["ethereum", "polygon", "arbitrum", "optimism", "base"]
DEFAULT_CATEGORIES = ["cex", "dex", "bridge", "fund"]


@dataclass
class IdentityEntry:
    """A single labeled address from Allium identity data."""

    address: str
    chain: str
    label: str
    project: str
    category: str


class IdentityClient:
    """Query Allium Explorer SQL for labeled blockchain addresses."""

    def __init__(self, api_key: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=EXPLORER_BASE,
            headers={"X-API-KEY": api_key},
            timeout=60.0,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _run_query(self, sql: str, limit: int = 10000) -> list[dict]:
        """Execute an Explorer SQL query and return results."""
        create_resp = await self._client.post(
            "/queries",
            json={"title": "ishmael_identity", "config": {"sql": sql, "limit": limit}},
        )
        create_resp.raise_for_status()
        query_id = create_resp.json()["query_id"]

        run_resp = await self._client.post(
            f"/queries/{query_id}/run",
            json={},
            timeout=120.0,
        )
        run_resp.raise_for_status()
        data = run_resp.json()
        return data.get("data", [])

    async def fetch_entities(
        self,
        chains: list[str] | None = None,
        categories: list[str] | None = None,
    ) -> list[IdentityEntry]:
        """Fetch labeled entities from Allium identity tables.

        Returns a list of IdentityEntry objects for known CEXes, DEXes, bridges, funds.
        """
        chains = chains or DEFAULT_CHAINS
        categories = categories or DEFAULT_CATEGORIES

        chain_list = ", ".join(f"'{c}'" for c in chains)
        cat_list = ", ".join(f"'{c}'" for c in categories)

        sql = f"""
            SELECT
                address,
                chain,
                name,
                project,
                category
            FROM common.identity.entities
            WHERE chain IN ({chain_list})
              AND category IN ({cat_list})
              AND address IS NOT NULL
            LIMIT 10000
        """

        rows = await self._run_query(sql)

        entries: list[IdentityEntry] = []
        for row in rows:
            addr = row.get("address", "")
            if not addr:
                continue
            entries.append(
                IdentityEntry(
                    address=addr.lower(),
                    chain=row.get("chain", ""),
                    label=row.get("name", "") or row.get("label", "") or "",
                    project=row.get("project", "") or "",
                    category=row.get("category", "") or "",
                )
            )

        logger.info("Fetched %d identity entities from Allium", len(entries))
        return entries
