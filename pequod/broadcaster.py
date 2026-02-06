"""Telegram broadcaster — send alerts to a channel via aiogram."""

from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.enums import ParseMode

logger = logging.getLogger(__name__)


class TelegramBroadcaster:
    """Fire-and-forget Telegram message sender."""

    def __init__(self, bot_token: str | None, chat_id: str | None) -> None:
        if bot_token and chat_id:
            self._bot: Bot | None = Bot(token=bot_token)
            self._chat_id = chat_id
        else:
            self._bot = None
            self._chat_id = ""
            logger.info("Telegram not configured — alerts will not be sent to Telegram")

    async def send_alert(self, message: str) -> None:
        """Send an HTML message to the configured chat. Logs errors but never raises."""
        if self._bot is None:
            return
        try:
            await self._bot.send_message(
                chat_id=self._chat_id,
                text=message,
                parse_mode=ParseMode.HTML,
                disable_web_page_preview=True,
            )
        except Exception:
            logger.exception("Failed to send Telegram message")

    async def close(self) -> None:
        if self._bot is not None:
            await self._bot.session.close()
