"""Tests for the /api/whales/history endpoint.

Verifies that:
1. The endpoint calls the Allium API and returns enriched whale alerts.
2. Longer lookback windows return more historical alerts.
3. Pagination via cursor fetches older transactions.
4. Caching prevents repeated API calls within the TTL.
5. Dedup removes duplicate tx_hash:alert_type combos.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx
from httpx import ASGITransport

from pequod import api_routes, pipeline
from pequod.client import AlliumClient
from pequod.geo import GeoMap
from pequod.server import create_app
from pequod.watchlist import Watchlist

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ALLIUM_BASE = "https://api.allium.so/api/v1/developer"


def _make_tx(
    tx_hash: str,
    chain: str,
    from_addr: str,
    to_addr: str,
    symbol: str,
    amount: float,
    timestamp: datetime,
) -> dict:
    """Build a raw Allium API transaction response dict."""
    return {
        "id": f"tx-{tx_hash}",
        "address": from_addr,
        "chain": chain,
        "hash": tx_hash,
        "index": 0,
        "block_timestamp": timestamp.isoformat(),
        "block_number": 1000,
        "from_address": from_addr,
        "to_address": to_addr,
        "asset_transfers": [
            {
                "transfer_type": "sent",
                "transaction_hash": tx_hash,
                "from_address": from_addr,
                "to_address": to_addr,
                "asset": {
                    "type": "evm_erc20",
                    "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                    "symbol": symbol,
                    "decimals": 6,
                },
                "amount": {"amount": amount},
            }
        ],
        "activities": [],
        "labels": [],
    }


def _make_price_response(
    address: str = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    chain: str = "ethereum",
    price: float = 1.0,
) -> dict:
    return {
        "items": [
            {
                "chain": chain,
                "address": address,
                "price": price,
                "decimals": 6,
            }
        ]
    }


@pytest.fixture()
def watchlist(tmp_path):
    """Minimal watchlist with two test addresses."""
    import json

    wl_dir = tmp_path / "watchlist"
    wl_dir.mkdir()
    (wl_dir / "ethereum.json").write_text(
        json.dumps(
            {
                "chain": "ethereum",
                "addresses": {
                    "exchanges": {
                        "Binance Hot": "0xBINANCE1111111111111111111111111111111111",
                        "Coinbase Hot": "0xCOINBASE2222222222222222222222222222222222",
                    }
                },
            }
        )
    )
    return Watchlist.from_directory(wl_dir)


@pytest.fixture()
def geo_map(watchlist):
    return GeoMap.from_watchlist(watchlist)


@pytest.fixture()
def allium_client():
    return AlliumClient("test-api-key")


@pytest.fixture(autouse=True)
def _configure_routes(watchlist, geo_map, allium_client):
    """Wire up shared state for api_routes before each test."""
    pipeline.geo_map = geo_map
    pipeline.label_registry = None
    api_routes.configure(
        watchlist,
        geo_map,
        client=allium_client,
        min_usd_threshold=500_000,
    )
    # Clear cache between tests
    api_routes._history_cache.clear()
    yield
    # Clean up
    api_routes._history_cache.clear()


@pytest.fixture()
def app():
    """Build a raw FastAPI app with the api_routes router (no lifespan)."""
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(api_routes.router)
    return app


@pytest.fixture()
async def client(app):
    """httpx.AsyncClient bound to the test app."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_returns_alerts(client):
    """Basic test: the history endpoint calls Allium and returns whale alerts."""
    now = datetime.now(timezone.utc)

    with respx.mock(base_url=ALLIUM_BASE) as mock:
        mock.post("/wallet/transactions").respond(
            200,
            json={
                "items": [
                    _make_tx(
                        "0xaaa",
                        "ethereum",
                        "0xbinance1111111111111111111111111111111111",
                        "0xcoinbase2222222222222222222222222222222222",
                        "USDC",
                        2_000_000,
                        now - timedelta(minutes=10),
                    ),
                ],
                "cursor": None,
            },
        )
        mock.post("/prices").respond(200, json=_make_price_response())

        resp = await client.get("/api/whales/history", params={"lookback_minutes": 60})

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["alerts"]) == 1
    alert = data["alerts"][0]
    assert alert["tx_hash"] == "0xaaa"
    assert alert["chain"] == "ethereum"
    assert alert["alert_type"] == "transfer"
    assert alert["usd_value"] == 2_000_000.0
    assert data["cached"] is False


@pytest.mark.asyncio
async def test_history_filters_by_threshold(client):
    """Alerts below the USD threshold are excluded."""
    now = datetime.now(timezone.utc)

    with respx.mock(base_url=ALLIUM_BASE) as mock:
        mock.post("/wallet/transactions").respond(
            200,
            json={
                "items": [
                    # $200K — below the $500K threshold set in the fixture
                    _make_tx(
                        "0xsmall",
                        "ethereum",
                        "0xbinance1111111111111111111111111111111111",
                        "0xcoinbase2222222222222222222222222222222222",
                        "USDC",
                        200_000,
                        now - timedelta(minutes=5),
                    ),
                ],
                "cursor": None,
            },
        )
        mock.post("/prices").respond(200, json=_make_price_response())

        resp = await client.get("/api/whales/history", params={"lookback_minutes": 30})

    data = resp.json()
    assert len(data["alerts"]) == 0


@pytest.mark.asyncio
async def test_longer_lookback_returns_more_alerts(client):
    """A 24h lookback should return more alerts than a 15m lookback
    when there are transactions spread across time."""
    now = datetime.now(timezone.utc)

    # Transactions at various ages
    recent_tx = _make_tx(
        "0xrecent",
        "ethereum",
        "0xbinance1111111111111111111111111111111111",
        "0xcoinbase2222222222222222222222222222222222",
        "USDC",
        5_000_000,
        now - timedelta(minutes=5),
    )
    medium_tx = _make_tx(
        "0xmedium",
        "ethereum",
        "0xbinance1111111111111111111111111111111111",
        "0xcoinbase2222222222222222222222222222222222",
        "USDC",
        3_000_000,
        now - timedelta(hours=2),
    )
    old_tx = _make_tx(
        "0xold",
        "ethereum",
        "0xbinance1111111111111111111111111111111111",
        "0xcoinbase2222222222222222222222222222222222",
        "USDC",
        8_000_000,
        now - timedelta(hours=20),
    )

    all_txs = [recent_tx, medium_tx, old_tx]

    with respx.mock(base_url=ALLIUM_BASE) as mock:
        mock.post("/wallet/transactions").respond(
            200,
            json={"items": all_txs, "cursor": None},
        )
        mock.post("/prices").respond(200, json=_make_price_response())

        # 15-minute lookback: should only get the recent tx
        resp_15m = await client.get("/api/whales/history", params={"lookback_minutes": 15})
        data_15m = resp_15m.json()

        # Clear cache before next request
        api_routes._history_cache.clear()

        # 24-hour lookback: should get all three
        resp_24h = await client.get("/api/whales/history", params={"lookback_minutes": 1440})
        data_24h = resp_24h.json()

    assert len(data_15m["alerts"]) == 1, f"Expected 1 alert for 15m, got {len(data_15m['alerts'])}"
    assert data_15m["alerts"][0]["tx_hash"] == "0xrecent"

    assert len(data_24h["alerts"]) == 3, f"Expected 3 alerts for 24h, got {len(data_24h['alerts'])}"
    hashes = {a["tx_hash"] for a in data_24h["alerts"]}
    assert hashes == {"0xrecent", "0xmedium", "0xold"}


@pytest.mark.asyncio
async def test_pagination_fetches_older_transactions(client):
    """The endpoint should follow cursor pagination to reach older transactions."""
    now = datetime.now(timezone.utc)

    page1_tx = _make_tx(
        "0xpage1",
        "ethereum",
        "0xbinance1111111111111111111111111111111111",
        "0xcoinbase2222222222222222222222222222222222",
        "USDC",
        5_000_000,
        now - timedelta(minutes=30),
    )
    page2_tx = _make_tx(
        "0xpage2",
        "ethereum",
        "0xbinance1111111111111111111111111111111111",
        "0xcoinbase2222222222222222222222222222222222",
        "USDC",
        7_000_000,
        now - timedelta(hours=3),
    )

    call_count = 0

    def tx_side_effect(request):
        nonlocal call_count
        call_count += 1
        # Parse cursor from query params
        url_cursor = request.url.params.get("cursor")
        if not url_cursor:
            # First page: return page1_tx with a cursor
            return httpx.Response(
                200,
                json={"items": [page1_tx], "cursor": "page2cursor"},
            )
        else:
            # Second page: return page2_tx with no cursor
            return httpx.Response(
                200,
                json={"items": [page2_tx], "cursor": None},
            )

    with respx.mock(base_url=ALLIUM_BASE) as mock:
        mock.post("/wallet/transactions").mock(side_effect=tx_side_effect)
        mock.post("/prices").respond(200, json=_make_price_response())

        resp = await client.get("/api/whales/history", params={"lookback_minutes": 480})

    data = resp.json()
    assert len(data["alerts"]) == 2, f"Expected 2 alerts (from 2 pages), got {len(data['alerts'])}"
    hashes = {a["tx_hash"] for a in data["alerts"]}
    assert "0xpage1" in hashes
    assert "0xpage2" in hashes
    # Should have made at least 2 transaction API calls (page 1 + page 2)
    assert call_count >= 2


@pytest.mark.asyncio
async def test_caching_prevents_duplicate_api_calls(client):
    """A second request within the cache TTL should return cached results."""
    now = datetime.now(timezone.utc)

    tx_call_count = 0

    def count_calls(request):
        nonlocal tx_call_count
        tx_call_count += 1
        return httpx.Response(
            200,
            json={
                "items": [
                    _make_tx(
                        "0xcached",
                        "ethereum",
                        "0xbinance1111111111111111111111111111111111",
                        "0xcoinbase2222222222222222222222222222222222",
                        "USDC",
                        1_000_000,
                        now - timedelta(minutes=10),
                    ),
                ],
                "cursor": None,
            },
        )

    with respx.mock(base_url=ALLIUM_BASE) as mock:
        mock.post("/wallet/transactions").mock(side_effect=count_calls)
        mock.post("/prices").respond(200, json=_make_price_response())

        # First request — hits API
        resp1 = await client.get("/api/whales/history", params={"lookback_minutes": 60})
        first_call_count = tx_call_count

        # Second request — should be cached
        resp2 = await client.get("/api/whales/history", params={"lookback_minutes": 60})

    assert resp1.json()["cached"] is False
    assert resp2.json()["cached"] is True
    assert len(resp2.json()["alerts"]) == 1
    # API shouldn't have been called again
    assert tx_call_count == first_call_count


@pytest.mark.asyncio
async def test_dedup_removes_duplicate_alerts(client):
    """Duplicate tx_hash:alert_type:symbol combos should be deduplicated."""
    now = datetime.now(timezone.utc)

    # Same transaction appearing in multiple batches (same tx_hash)
    dup_tx = _make_tx(
        "0xdup",
        "ethereum",
        "0xbinance1111111111111111111111111111111111",
        "0xcoinbase2222222222222222222222222222222222",
        "USDC",
        10_000_000,
        now - timedelta(minutes=5),
    )

    with respx.mock(base_url=ALLIUM_BASE) as mock:
        # Both batches return the same transaction
        mock.post("/wallet/transactions").respond(
            200,
            json={"items": [dup_tx, dup_tx], "cursor": None},
        )
        mock.post("/prices").respond(200, json=_make_price_response())

        resp = await client.get("/api/whales/history", params={"lookback_minutes": 30})

    data = resp.json()
    assert len(data["alerts"]) == 1, f"Expected 1 (deduped), got {len(data['alerts'])}"


@pytest.mark.asyncio
async def test_history_includes_geo_coords(client):
    """Alerts should include geo coordinates from the GeoMap."""
    now = datetime.now(timezone.utc)

    with respx.mock(base_url=ALLIUM_BASE) as mock:
        mock.post("/wallet/transactions").respond(
            200,
            json={
                "items": [
                    _make_tx(
                        "0xgeo",
                        "ethereum",
                        "0xbinance1111111111111111111111111111111111",
                        "0xcoinbase2222222222222222222222222222222222",
                        "USDC",
                        5_000_000,
                        now - timedelta(minutes=5),
                    ),
                ],
                "cursor": None,
            },
        )
        mock.post("/prices").respond(200, json=_make_price_response())

        resp = await client.get("/api/whales/history", params={"lookback_minutes": 60})

    alert = resp.json()["alerts"][0]
    # GeoMap assigns coordinates to all addresses
    assert "from_lat" in alert
    assert "from_lon" in alert
    assert "to_lat" in alert
    assert "to_lon" in alert


@pytest.mark.asyncio
async def test_server_not_ready_returns_empty(app):
    """If client is not configured, endpoint returns empty with error."""
    # Deconfigure
    api_routes._client = None
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get("/api/whales/history", params={"lookback_minutes": 60})
    data = resp.json()
    assert data["alerts"] == []
    assert "error" in data
