"""Entry point: python -m pequod."""

import asyncio
import logging

from pequod.poller import run_poller
from pequod.settings import Settings


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    settings = Settings()  # type: ignore[call-arg]
    asyncio.run(run_poller(settings))


if __name__ == "__main__":
    main()
