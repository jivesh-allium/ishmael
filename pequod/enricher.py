"""Fetch token prices and calculate USD values for transfers."""

from __future__ import annotations

import logging

from pequod.client import AlliumClient
from pequod.models import (
    AssetBridgeActivity,
    BitcoinTransfer,
    DexTradeActivity,
    EVMAsset,
    EVMTransfer,
    LiquidityPoolBurnActivity,
    LiquidityPoolMintActivity,
    SolanaAsset,
    SolanaTransfer,
    WalletTransaction,
)

logger = logging.getLogger(__name__)

# Native token → wrapped equivalent for price lookup
NATIVE_TO_WRAPPED: dict[str, dict[str, str]] = {
    "ethereum": {
        "address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",  # WETH
    },
    "polygon": {
        "address": "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",  # WMATIC
    },
    "arbitrum": {
        "address": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",  # WETH on Arb
    },
    "optimism": {
        "address": "0x4200000000000000000000000000000000000006",  # WETH on OP
    },
    "base": {
        "address": "0x4200000000000000000000000000000000000006",  # WETH on Base
    },
    "solana": {
        "address": "So11111111111111111111111111111111111111112",  # WSOL
    },
    "bitcoin": {
        "address": "btc",  # placeholder — price API may handle natively
    },
}

# Key for price_map: (address_lower, chain)
PriceMap = dict[tuple[str, str], float]


def _get_asset_key(
    asset: EVMAsset | SolanaAsset, chain: str
) -> tuple[str, str] | None:
    """Return (token_address, chain) for price lookup, mapping native tokens."""
    if asset.type == "native" or asset.address is None:
        wrapped = NATIVE_TO_WRAPPED.get(chain)
        if wrapped:
            return (wrapped["address"].lower(), chain)
        return None
    return (asset.address.lower(), chain)


def collect_token_keys(txs: list[WalletTransaction]) -> list[dict[str, str]]:
    """Gather unique (token_address, chain) pairs from all transfers + activities."""
    seen: set[tuple[str, str]] = set()
    tokens: list[dict[str, str]] = []

    def _add(key: tuple[str, str] | None) -> None:
        if key and key not in seen:
            seen.add(key)
            tokens.append({"token_address": key[0], "chain": key[1]})

    for tx in txs:
        for xfer in tx.asset_transfers:
            if isinstance(xfer, (EVMTransfer, SolanaTransfer)):
                _add(_get_asset_key(xfer.asset, tx.chain))
            elif isinstance(xfer, BitcoinTransfer):
                # Bitcoin native — use chain mapping
                wrapped = NATIVE_TO_WRAPPED.get(tx.chain)
                if wrapped:
                    _add((wrapped["address"].lower(), tx.chain))

        for act in tx.activities:
            if isinstance(act, DexTradeActivity):
                _add(_get_asset_key(act.asset_bought, tx.chain))
                _add(_get_asset_key(act.asset_sold, tx.chain))
            elif isinstance(act, AssetBridgeActivity):
                _add(_get_asset_key(act.token_in_asset, tx.chain))
                _add(_get_asset_key(act.token_out_asset, tx.chain))
            elif isinstance(act, (LiquidityPoolMintActivity, LiquidityPoolBurnActivity)):
                _add(_get_asset_key(act.token0, tx.chain))
                _add(_get_asset_key(act.token1, tx.chain))

    return tokens


async def build_price_map(
    client: AlliumClient, txs: list[WalletTransaction]
) -> PriceMap:
    """Fetch prices for all tokens referenced in the transactions."""
    token_keys = collect_token_keys(txs)
    if not token_keys:
        return {}

    # Batch in groups of 200 (API max)
    price_map: PriceMap = {}
    for i in range(0, len(token_keys), 200):
        batch = token_keys[i : i + 200]
        try:
            resp = await client.get_prices(batch)
            for item in resp.items:
                price_map[(item.address.lower(), item.chain)] = item.price
        except Exception:
            logger.exception("Failed to fetch prices for batch starting at %d", i)

    logger.info("Fetched prices for %d / %d tokens", len(price_map), len(token_keys))
    return price_map


def get_usd_value(
    asset: EVMAsset | SolanaAsset,
    amount: float | None,
    chain: str,
    price_map: PriceMap,
) -> float:
    """Look up price and compute USD value. Returns 0.0 if price missing."""
    if amount is None or amount == 0:
        return 0.0
    key = _get_asset_key(asset, chain)
    if key is None:
        return 0.0
    price = price_map.get(key, 0.0)
    return amount * price
