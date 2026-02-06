"""Unified label registry — merges static watchlist labels with Allium identity data."""

from __future__ import annotations

import logging

from pequod.identity import IdentityEntry
from pequod.watchlist import Watchlist

logger = logging.getLogger(__name__)


class LabelRegistry:
    """Merged label lookup: static watchlist (priority) + Allium identity."""

    def __init__(self, watchlist: Watchlist) -> None:
        self._watchlist = watchlist
        # chain -> address (lowercase) -> {label, project, category}
        self._identity: dict[str, dict[str, dict[str, str]]] = {}
        self._identity_count = 0

    def merge_identity(self, entries: list[IdentityEntry]) -> None:
        """Merge Allium identity entries, skipping addresses already in the static watchlist."""
        merged = 0
        for entry in entries:
            # Skip if the static watchlist already has this address
            if self._watchlist.get_label(entry.address, entry.chain):
                continue

            chain_map = self._identity.setdefault(entry.chain, {})
            key = entry.address.lower()
            if key not in chain_map:
                chain_map[key] = {
                    "label": entry.label,
                    "project": entry.project,
                    "category": entry.category,
                }
                merged += 1

        self._identity_count = merged
        logger.info("LabelRegistry: merged %d identity labels", merged)

    def get_label(self, address: str | None, chain: str | None = None) -> str | None:
        """Look up a label. Static watchlist takes priority, then identity data."""
        if not address:
            return None

        # 1. Check static watchlist first
        wl_label = self._watchlist.get_label(address, chain)
        if wl_label:
            return wl_label

        # 2. Check identity data
        key = address.lower()
        if chain:
            entry = self._identity.get(chain, {}).get(key)
            if entry:
                return entry["label"] or entry["project"] or None
        else:
            for chain_map in self._identity.values():
                entry = chain_map.get(key)
                if entry:
                    return entry["label"] or entry["project"] or None

        return None

    def get_project(self, address: str, chain: str | None = None) -> str | None:
        """Return the project field for an identity address (used for geo mapping)."""
        key = address.lower()
        if chain:
            entry = self._identity.get(chain, {}).get(key)
            if entry:
                return entry["project"] or None
        else:
            for chain_map in self._identity.values():
                entry = chain_map.get(key)
                if entry:
                    return entry["project"] or None
        return None

    def get_identity_category(self, address: str, chain: str | None = None) -> str | None:
        """Return the raw Allium identity category (cex, dex, bridge, fund, etc.)."""
        key = address.lower()
        if chain:
            entry = self._identity.get(chain, {}).get(key)
            if entry:
                return entry.get("category") or None
        else:
            for chain_map in self._identity.values():
                entry = chain_map.get(key)
                if entry:
                    return entry.get("category") or None
        return None

    def identity_addresses(self) -> list[tuple[str, str]]:
        """Return all identity (address, chain) pairs not in the static watchlist."""
        result: list[tuple[str, str]] = []
        for chain, addrs in self._identity.items():
            for addr in addrs:
                result.append((addr, chain))
        return result

    @property
    def identity_count(self) -> int:
        return self._identity_count
