"""Format WhaleAlert objects into human-readable Telegram messages (HTML)."""

from __future__ import annotations

from pequod.models import WhaleAlert

# Emoji per alert type
EMOJI: dict[str, str] = {
    "transfer": "\U0001F40B",  # whale
    "mint": "\U0001F30A",      # wave
    "burn": "\U0001F525",      # fire
    "dex_trade": "\U0001F500", # twisted arrows
    "bridge": "\U0001F309",    # bridge at night
}

EXPLORER_BASE: dict[str, str] = {
    "ethereum": "https://etherscan.io/tx/",
    "bitcoin": "https://mempool.space/tx/",
    "solana": "https://solscan.io/tx/",
    "polygon": "https://polygonscan.com/tx/",
    "arbitrum": "https://arbiscan.io/tx/",
    "optimism": "https://optimistic.etherscan.io/tx/",
    "base": "https://basescan.org/tx/",
}


def shorten_address(addr: str | None) -> str:
    """0x1234…abcd or full if too short."""
    if not addr:
        return "unknown"
    if len(addr) <= 12:
        return addr
    return f"{addr[:6]}...{addr[-4:]}"


def format_label_or_address(addr: str | None, label: str | None) -> str:
    """Show label if known, otherwise shortened address."""
    if label:
        return f"<b>{label}</b>"
    return f"<code>{shorten_address(addr)}</code>"


def format_amount(value: float | None) -> str:
    """Format a token amount with commas, max 2 decimals."""
    if value is None:
        return "?"
    if value >= 1_000:
        return f"{value:,.0f}"
    if value >= 1:
        return f"{value:,.2f}"
    return f"{value:.4f}"


def format_usd(value: float) -> str:
    """Format USD value with $ and commas."""
    if value >= 1_000_000:
        return f"${value / 1_000_000:,.2f}M"
    if value >= 1_000:
        return f"${value:,.0f}"
    return f"${value:,.2f}"


def _tx_link(chain: str, tx_hash: str) -> str:
    base = EXPLORER_BASE.get(chain, "")
    if base:
        return f'<a href="{base}{tx_hash}">TX</a>'
    return f"<code>{tx_hash[:10]}...</code>"


def format_transfer_alert(alert: WhaleAlert) -> str:
    emoji = EMOJI.get(alert.alert_type, EMOJI["transfer"])
    from_str = format_label_or_address(alert.from_address, alert.from_label)
    to_str = format_label_or_address(alert.to_address, alert.to_label)
    amt = format_amount(alert.amount)
    usd = format_usd(alert.usd_value)
    symbol = alert.asset_symbol or "?"
    tx = _tx_link(alert.chain, alert.tx_hash)

    lines = [
        f"{emoji} <b>{alert.alert_type.upper()}</b> on {alert.chain.title()}",
        f"{amt} {symbol} ({usd})",
        f"{from_str} \u2192 {to_str}",
        tx,
    ]
    return "\n".join(lines)


def format_dex_trade_alert(alert: WhaleAlert) -> str:
    emoji = EMOJI["dex_trade"]
    sold = format_amount(alert.amount_sold)
    bought = format_amount(alert.amount_bought)
    usd = format_usd(alert.usd_value)
    tx = _tx_link(alert.chain, alert.tx_hash)
    protocol = alert.protocol or "DEX"

    from_str = format_label_or_address(alert.from_address, alert.from_label)

    lines = [
        f"{emoji} <b>DEX TRADE</b> on {alert.chain.title()} ({protocol})",
        f"Sold {sold} {alert.asset_sold_symbol or '?'} \u2192 Bought {bought} {alert.asset_bought_symbol or '?'}",
        f"Value: {usd}",
        f"Trader: {from_str}",
        tx,
    ]
    return "\n".join(lines)


def format_bridge_alert(alert: WhaleAlert) -> str:
    emoji = EMOJI["bridge"]
    amt = format_amount(alert.amount)
    usd = format_usd(alert.usd_value)
    symbol = alert.asset_symbol or "?"
    tx = _tx_link(alert.chain, alert.tx_hash)
    protocol = alert.protocol or "Bridge"

    from_str = format_label_or_address(alert.from_address, alert.from_label)
    to_str = format_label_or_address(alert.to_address, alert.to_label)

    src = (alert.source_chain or "?").title()
    dst = (alert.destination_chain or "?").title()

    lines = [
        f"{emoji} <b>BRIDGE</b> via {protocol}",
        f"{amt} {symbol} ({usd})",
        f"{src} \u2192 {dst}",
        f"{from_str} \u2192 {to_str}",
        tx,
    ]
    return "\n".join(lines)


def format_alert(alert: WhaleAlert) -> str:
    """Route to the right formatter based on alert_type."""
    if alert.alert_type == "dex_trade":
        return format_dex_trade_alert(alert)
    if alert.alert_type == "bridge":
        return format_bridge_alert(alert)
    return format_transfer_alert(alert)
