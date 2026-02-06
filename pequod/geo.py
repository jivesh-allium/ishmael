"""Category-based spiral layout — position entities by watchlist category."""

from __future__ import annotations

import hashlib
import logging
import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pequod.watchlist import Watchlist

logger = logging.getLogger(__name__)

# Golden angle in radians (≈137.508°) — guarantees even angular spread
_GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))

# Category → region center (lat, lon) and spread radius in degrees
_CATEGORY_REGIONS: dict[str, dict[str, float]] = {
    "exchanges": {"lat": 35.0, "lon": -80.0, "spread": 22.0},
    "defi_protocols": {"lat": 35.0, "lon": 80.0, "spread": 22.0},
    "whales": {"lat": -30.0, "lon": -80.0, "spread": 22.0},
    "funds_institutions": {"lat": -30.0, "lon": 80.0, "spread": 22.0},
}

# Map common watchlist JSON category keys to the four archipelago regions
_CATEGORY_ALIASES: dict[str, str] = {
    "exchanges": "exchanges",
    "defi_protocols": "defi_protocols",
    "whales": "whales",
    "funds_institutions": "funds_institutions",
    # Additional categories from watchlist JSONs → best-fit region
    "treasuries": "defi_protocols",
    "stablecoin_issuers": "funds_institutions",
    "bridges": "defi_protocols",
    "wrapped_staking": "defi_protocols",
    "defi": "defi_protocols",
    "funds": "funds_institutions",
    "institutions": "funds_institutions",
    "memecoins": "whales",
    "nft": "whales",
}

# Default region for categories we don't recognize
_DEFAULT_REGION = _CATEGORY_REGIONS["whales"]

# Map Allium identity categories to our archipelago regions
_IDENTITY_CATEGORY_MAP: dict[str, str] = {
    "cex": "exchanges",
    "dex": "defi_protocols",
    "bridge": "defi_protocols",
    "fund": "funds_institutions",
    "defi": "defi_protocols",
    "nft": "whales",
}


def _spiral_position(
    index: int,
    total: int,
    center: dict[str, float],
    spread: float,
) -> dict[str, float]:
    """Place item at `index` using a Fibonacci spiral around `center`.

    The golden-angle spiral guarantees no two points overlap and produces
    a visually even distribution within a circular region.
    """
    if total <= 0:
        return {"lat": center["lat"], "lon": center["lon"]}

    # Radius grows with sqrt(index) to keep density even
    r = spread * math.sqrt(index + 1) / math.sqrt(total + 1)
    theta = (index + 1) * _GOLDEN_ANGLE

    lat = center["lat"] + r * math.sin(theta)
    lon = center["lon"] + r * math.cos(theta)

    # Clamp to valid geo range
    lat = max(-75.0, min(75.0, lat))
    lon = max(-179.0, min(179.0, lon))

    return {"lat": lat, "lon": lon}


def _hash_position(address: str) -> dict[str, float]:
    """Deterministic hash-based spread across the full map for unknown addresses."""
    h = hashlib.sha256(address.encode()).digest()
    # Map bytes to lat [-60, 60] and lon [-170, 170]
    lat = ((h[0] / 255.0) * 120.0) - 60.0
    lon = ((h[1] / 255.0) * 340.0) - 170.0
    return {"lat": lat, "lon": lon}


def _hash_position_in_region(
    address: str,
    region: dict[str, float],
) -> dict[str, float]:
    """Deterministic hash-based position within a specific category region."""
    h = hashlib.sha256(address.encode()).digest()
    spread = region.get("spread", 22.0)
    lat_offset = ((h[0] / 255.0) - 0.5) * spread * 1.2
    lon_offset = ((h[1] / 255.0) - 0.5) * spread * 1.2
    lat = max(-75.0, min(75.0, region["lat"] + lat_offset))
    lon = max(-179.0, min(179.0, region["lon"] + lon_offset))
    return {"lat": lat, "lon": lon}


def _resolve_region(category: str | None) -> dict[str, float]:
    """Map a watchlist category to its archipelago region."""
    if not category:
        return _DEFAULT_REGION
    canonical = _CATEGORY_ALIASES.get(category, category)
    return _CATEGORY_REGIONS.get(canonical, _DEFAULT_REGION)


class GeoMap:
    """Address → location mapping using category-based spiral layout."""

    def __init__(self) -> None:
        self._map: dict[str, dict] = {}

    @classmethod
    def from_watchlist(cls, watchlist: Watchlist) -> GeoMap:
        """Build geo map from watchlist using category spiral positioning.

        This is a sync method — no API calls needed.
        """
        gm = cls()

        # Group entries by resolved category region
        groups: dict[str, list[dict[str, str]]] = {}
        for entry in watchlist.all_entries():
            addr = entry["address"]
            chain = entry["chain"]
            cat = watchlist.get_category(addr, chain)
            region_key = _CATEGORY_ALIASES.get(cat, cat) if cat else "whales"
            groups.setdefault(region_key, []).append(entry)

        # Place each group using the Fibonacci spiral
        for region_key, entries in groups.items():
            region = _CATEGORY_REGIONS.get(region_key, _DEFAULT_REGION)
            spread = region.get("spread", 22.0)
            total = len(entries)
            for i, entry in enumerate(entries):
                pos = _spiral_position(i, total, region, spread)
                gm._map[entry["address"]] = {
                    "address": entry["address"],
                    "lat": pos["lat"],
                    "lon": pos["lon"],
                    "country": "XX",
                    "region": region_key,
                    "confidence": 1.0,
                }

        logger.info(
            "GeoMap: placed %d watchlist addresses in %d category regions",
            len(gm._map),
            len(groups),
        )
        return gm

    def register_identity_geo(self, label_registry: object) -> None:
        """Assign geo to identity addresses using their Allium category.

        Maps identity categories (cex, dex, bridge, fund) to archipelago
        regions and uses hash-based positioning within the region.
        """
        from pequod.label_registry import LabelRegistry

        if not isinstance(label_registry, LabelRegistry):
            return

        added = 0
        for addr, chain in label_registry.identity_addresses():
            key = addr.lower()
            if key in self._map:
                continue

            identity_cat = label_registry.get_identity_category(addr, chain)
            region_key = _IDENTITY_CATEGORY_MAP.get(identity_cat or "", None)

            if region_key:
                region = _CATEGORY_REGIONS[region_key]
                pos = _hash_position_in_region(key, region)
            else:
                pos = _hash_position(key)

            self._map[key] = {
                "address": key,
                "lat": pos["lat"],
                "lon": pos["lon"],
                "country": "XX",
                "region": region_key or "unknown",
                "confidence": 0.5 if region_key else 0.0,
            }
            added += 1

        logger.info("Registered geo for %d identity addresses", added)

    def get(self, address: str) -> dict:
        """Look up geo for an address. Tries lowercase, then original case.

        Unknown addresses get hash-spread across the full map.
        """
        entry = self._map.get(address.lower())
        if entry:
            return entry
        entry = self._map.get(address)
        if entry:
            return entry
        # Unknown address — deterministic full-map spread
        pos = _hash_position(address)
        return {
            "address": address.lower(),
            "lat": pos["lat"],
            "lon": pos["lon"],
            "country": "XX",
            "region": "unknown",
            "confidence": 0.0,
        }

    def all_entries(self) -> list[dict]:
        """All address geo entries."""
        return list(self._map.values())
