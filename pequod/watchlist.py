"""Load labeled addresses from JSON files and batch them for API calls."""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_DATA_DIR = Path(__file__).parent / "data" / "watchlist"

# EVM chains use hex addresses (case-insensitive). All others (Solana Base58,
# Bitcoin Base58Check) are case-sensitive and must be stored as-is.
EVM_CHAINS = frozenset(
    {
        "ethereum",
        "polygon",
        "arbitrum",
        "optimism",
        "base",
        "avalanche",
        "bsc",
        "fantom",
        "gnosis",
        "celo",
        "linea",
        "scroll",
        "zksync",
        "blast",
        "mantle",
        "mode",
        "zora",
    }
)


def _normalize_address(address: str, chain: str) -> str:
    """Lowercase only EVM addresses; preserve case for Solana/Bitcoin/others."""
    return address.lower() if chain in EVM_CHAINS else address


class Watchlist:
    """Maintains a chain→address→label mapping loaded from JSON files."""

    def __init__(self) -> None:
        # chain -> address (normalized) -> label
        self._labels: dict[str, dict[str, str]] = {}
        # chain -> address (normalized) -> category (e.g. "exchanges", "whales")
        self._categories: dict[str, dict[str, str]] = {}

    @classmethod
    def from_directory(cls, path: Path = DEFAULT_DATA_DIR) -> Watchlist:
        wl = cls()
        for fp in sorted(path.glob("*.json")):
            with open(fp) as f:
                data = json.load(f)
            chain = data["chain"]
            if chain not in wl._labels:
                wl._labels[chain] = {}
            if chain not in wl._categories:
                wl._categories[chain] = {}
            for _category, addrs in data["addresses"].items():
                for label, address in addrs.items():
                    key = _normalize_address(address, chain)
                    wl._labels[chain][key] = label
                    wl._categories[chain][key] = _category
            logger.info(
                "Loaded %s addresses for %s from %s", len(wl._labels[chain]), chain, fp.name
            )
        return wl

    def get_label(self, address: str, chain: str | None = None) -> str | None:
        if chain:
            key = _normalize_address(address, chain)
            return self._labels.get(chain, {}).get(key)
        # No chain specified — try all chains
        for ch, chain_labels in self._labels.items():
            key = _normalize_address(address, ch)
            if key in chain_labels:
                return chain_labels[key]
        return None

    def get_category(self, address: str, chain: str | None = None) -> str | None:
        """Return the watchlist category for an address (e.g. 'exchanges', 'whales')."""
        if chain:
            key = _normalize_address(address, chain)
            return self._categories.get(chain, {}).get(key)
        for ch, chain_cats in self._categories.items():
            key = _normalize_address(address, ch)
            if key in chain_cats:
                return chain_cats[key]
        return None

    def all_entries(self) -> list[dict[str, str]]:
        """Return flat list of {"chain": ..., "address": ...} for all addresses."""
        entries = []
        for chain, addrs in self._labels.items():
            for address in addrs:
                entries.append({"chain": chain, "address": address})
        return entries

    def batches(
        self,
        size: int = 20,
        exclude_chains: frozenset[str] | None = None,
    ) -> list[list[dict[str, str]]]:
        """Split entries into groups of `size` (API max is 20/request).

        Args:
            size: max addresses per batch.
            exclude_chains: chains to skip (e.g. bitcoin, which the wallet
                transactions API doesn't reliably support).
        """
        entries = self.all_entries()
        if exclude_chains:
            entries = [e for e in entries if e["chain"] not in exclude_chains]
        return [entries[i : i + size] for i in range(0, len(entries), size)]

    @property
    def total_addresses(self) -> int:
        return sum(len(addrs) for addrs in self._labels.values())
