"""Pydantic v2 models for Allium API responses and internal WhaleAlert."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Allium shared primitives
# ---------------------------------------------------------------------------


class AssetAmount(BaseModel):
    raw_amount: str | None = None
    amount_str: str | None = None
    amount: float | None = None


class EVMAsset(BaseModel):
    type: Literal["native", "evm_erc20", "evm_erc721", "evm_erc1155"] | None = None
    address: str | None = None
    name: str | None = None
    symbol: str | None = None
    decimals: int | None = None
    token_id: str | None = None


class SolanaAsset(BaseModel):
    type: Literal["native", "sol_spl", "sol_nft"] | None = None
    address: str | None = None
    name: str | None = None
    symbol: str | None = None
    decimals: int | None = None
    token_id: str | None = None


class BitcoinAsset(BaseModel):
    type: Literal["native", "btc_inscription", "btc_brc20", "btc_rune"] | None = None
    name: str | None = None
    symbol: str | None = None
    decimals: int | None = None
    token_id: str | None = None


# Union of all asset types the API may return
Asset = EVMAsset | SolanaAsset | BitcoinAsset


# ---------------------------------------------------------------------------
# Transfers
# ---------------------------------------------------------------------------


class EVMTransfer(BaseModel):
    transfer_type: Literal["sent", "received"]
    operation: Literal["mint", "burn"] | None = None
    transaction_hash: str
    log_index: int | None = None
    from_address: str
    to_address: str
    asset: EVMAsset
    amount: AssetAmount


class SolanaTransfer(BaseModel):
    transaction_hash: str | None = None
    log_index: int | None = None
    transfer_type: Literal["sent", "received", "invalid", "minted", "burned"]
    from_address: str | None = None
    to_address: str | None = None
    from_token_account: str | None = None
    to_token_account: str | None = None
    asset: SolanaAsset
    amount: AssetAmount


class BitcoinTransfer(BaseModel):
    transfer_type: Literal["sent", "received"]
    from_address: str | None = None
    to_address: str | None = None
    asset: BitcoinAsset
    amount: AssetAmount


Transfer = EVMTransfer | SolanaTransfer | BitcoinTransfer


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


class DexTradeActivity(BaseModel):
    type: Literal["dex_trade"] = "dex_trade"
    transaction_hash: str
    log_index: int | None = None
    trace_index: int | None = None
    asset_bought: EVMAsset | SolanaAsset
    asset_sold: EVMAsset | SolanaAsset
    amount_bought: AssetAmount
    amount_sold: AssetAmount
    project: str | None = None
    protocol: str | None = None


class AssetBridgeActivity(BaseModel):
    type: Literal["asset_bridge"] = "asset_bridge"
    transaction_hash: str
    log_index: int | None = None
    trace_index: int | None = None
    protocol: str
    sender_address: str
    recipient_address: str
    token_in_asset: EVMAsset
    token_in_amount: AssetAmount
    token_out_asset: EVMAsset
    token_out_amount: AssetAmount
    direction: str
    source_chain: str
    destination_chain: str


class LiquidityPoolMintActivity(BaseModel):
    type: Literal["dex_liquidity_pool_mint"] = "dex_liquidity_pool_mint"
    project: str | None = None
    protocol: str | None = None
    liquidity_pool_address: str
    token0: EVMAsset
    token1: EVMAsset
    token0_amount: AssetAmount
    token1_amount: AssetAmount
    lp_tokens_amount: int | None = None
    transaction_hash: str
    log_index: int


class LiquidityPoolBurnActivity(BaseModel):
    type: Literal["dex_liquidity_pool_burn"] = "dex_liquidity_pool_burn"
    project: str | None = None
    protocol: str | None = None
    liquidity_pool_address: str
    token0: EVMAsset
    token1: EVMAsset
    token0_amount: AssetAmount
    token1_amount: AssetAmount
    lp_tokens_amount: int | None = None
    transaction_hash: str
    log_index: int


class AssetApprovalActivity(BaseModel):
    type: Literal["asset_approval"] = "asset_approval"
    asset: EVMAsset
    transaction_hash: str
    log_index: int | None = None
    trace_index: int | None = None
    contract_address: str | None = None
    spender_address: str | None = None
    approved_amount: AssetAmount | None = None
    status: Literal["approved", "revoked"]
    granularity: Literal["token", "collection"]


class NftTradeActivity(BaseModel):
    type: Literal["nft_trade"] = "nft_trade"
    side: Literal["buyer", "seller"]
    transaction_hash: str
    log_index: int | None = None
    trace_index: int | None = None
    asset: EVMAsset | SolanaAsset
    asset_amount: AssetAmount
    currency: EVMAsset | SolanaAsset
    currency_amount: AssetAmount
    buyer_address: str
    seller_address: str
    marketplace: str
    protocol: str


class LiquidityPoolCreatedActivity(BaseModel):
    type: Literal["dex_liquidity_pool_created"] = "dex_liquidity_pool_created"
    transaction_hash: str
    pool_id: str | None = None
    project: str | None = None
    protocol: str | None = None
    liquidity_pool_address: str | None = None
    token0: EVMAsset | None = None
    token1: EVMAsset | None = None
    log_index: int | None = None


class UnknownActivity(BaseModel):
    """Catch-all for any future activity types the API may add."""

    type: str
    transaction_hash: str | None = None

    model_config = {"extra": "allow"}


Activity = (
    DexTradeActivity
    | AssetBridgeActivity
    | LiquidityPoolMintActivity
    | LiquidityPoolBurnActivity
    | LiquidityPoolCreatedActivity
    | AssetApprovalActivity
    | NftTradeActivity
    | UnknownActivity
)


# ---------------------------------------------------------------------------
# Wallet Transaction (top-level item from /wallet/transactions)
# ---------------------------------------------------------------------------


class WalletTransaction(BaseModel):
    id: str
    address: str
    chain: str
    hash: str
    index: int
    within_block_order_key: int | None = None
    block_timestamp: datetime
    block_number: int
    block_hash: str | None = None
    fee: AssetAmount | None = None
    labels: list[str] = Field(default_factory=list)
    asset_transfers: list[EVMTransfer | SolanaTransfer | BitcoinTransfer] = Field(
        default_factory=list
    )
    activities: list[Activity] = Field(default_factory=list)
    # EVM / Solana
    from_address: str | None = None
    to_address: str | None = None
    # EVM
    type: int | None = None


class TransactionsResponse(BaseModel):
    items: list[WalletTransaction] = Field(default_factory=list)
    cursor: str | None = None


# ---------------------------------------------------------------------------
# Prices API response
# ---------------------------------------------------------------------------


class TokenPrice(BaseModel):
    timestamp: datetime | None = None
    chain: str
    address: str
    decimals: int | None = None
    price: float
    open: float | None = None
    high: float | None = None
    close: float | None = None
    low: float | None = None


class PricesResponse(BaseModel):
    items: list[TokenPrice] = Field(default_factory=list)
    cursor: str | None = None


class PriceHistoryPoint(BaseModel):
    timestamp: datetime
    price: float
    open: float | None = None
    high: float | None = None
    close: float | None = None
    low: float | None = None


# ---------------------------------------------------------------------------
# Internal WhaleAlert model
# ---------------------------------------------------------------------------

AlertType = Literal["transfer", "mint", "burn", "dex_trade", "bridge"]


class WhaleAlert(BaseModel):
    tx_hash: str
    chain: str
    block_timestamp: datetime
    alert_type: AlertType
    from_address: str | None = None
    to_address: str | None = None
    from_label: str | None = None
    to_label: str | None = None
    asset_symbol: str | None = None
    amount: float | None = None
    usd_value: float = 0.0
    # Extra context for specific alert types
    protocol: str | None = None
    source_chain: str | None = None
    destination_chain: str | None = None
    asset_bought_symbol: str | None = None
    asset_sold_symbol: str | None = None
    amount_bought: float | None = None
    amount_sold: float | None = None
