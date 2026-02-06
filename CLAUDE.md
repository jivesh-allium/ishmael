# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pequod is a real-time whale transaction alert system for cryptocurrency, built to showcase Allium's blockchain data APIs. It monitors large crypto transactions (transfers, DEX trades, bridges, mints, burns) across a curated watchlist of 95 addresses (Ethereum, Solana, Bitcoin) and broadcasts alerts via Telegram and a nautical-themed web visualization.

## Commands

### Development
```bash
make dev          # Parallel: backend (uvicorn --reload :8000) + frontend (vite HMR :5173)
make run          # Build frontend then run production server on :8000
make build        # Build frontend only (npm install + npm run build)
make docker       # Build Docker image
make clean        # Remove frontend/dist and frontend/node_modules
```

### Backend only
```bash
uv run uvicorn pequod.server:app --reload --port 8000   # Dev server with reload
uv run python -m pequod                                  # CLI poller only (no web server)
```

### Frontend only
```bash
cd frontend && npm run dev       # Vite dev server on :5173 (proxies /api and /ws to :8000)
cd frontend && npm run build     # Production build to frontend/dist/
```

### Linting & Testing
```bash
uv run ruff check pequod/        # Lint Python (target: py311, line-length: 100)
uv run ruff format pequod/       # Format Python
uv run pytest                    # Run tests (asyncio_mode=auto, uses respx for HTTP mocking)
```

No tests exist yet. Test infra is configured: pytest + pytest-asyncio + respx.

## Architecture

### Pipeline Flow
```
Watchlist (JSON) → Poller → Pipeline → [Enricher → Filter → Dedup → Formatter] → Broadcaster (Telegram)
                                                                                 → WebSocket → Frontend
```

The backend polls Allium's `/wallet/transactions` endpoint in batches of 20 addresses, enriches with USD prices, filters by threshold ($1M default), deduplicates, then broadcasts to Telegram and connected WebSocket clients.

### Backend (`pequod/`)

| Module | Role |
|--------|------|
| `server.py` | FastAPI app with lifespan: loads watchlist, fetches geo, starts poller + WS broadcast as background tasks. Serves built frontend as SPA. |
| `pipeline.py` | Core orchestration. Shared state: `alert_buffer` (deque, 1000) and `ws_queue` (asyncio.Queue, 5000). |
| `client.py` | Async httpx wrapper for Allium Developer API (`/wallet/transactions`, `/prices`). |
| `enricher.py` | Fetches token prices, maps native→wrapped tokens (ETH→WETH, SOL→WSOL), calculates USD values. |
| `dedup.py` | Two backends: `InMemoryDedupStore` (dict + TTL) or `RedisDedupStore` (48h TTL). Key: `{tx_hash}:{type}:{symbol}`. |
| `formatter.py` | Builds HTML messages for Telegram with emoji per alert type and explorer links. |
| `broadcaster.py` | Sends via aiogram Bot. Gracefully no-ops if Telegram not configured. |
| `api_routes.py` | REST: `GET /api/map`, `GET /api/whales`, `GET /api/whale/{tx_hash}`. WS: `/ws/alerts` (25s keepalive). |
| `geo.py` | Queries Allium Explorer SQL for address geography, maps to lat/lon centroids. |
| `watchlist.py` | Loads `data/watchlist/*.json`. Structure: `{chain: {category: {label: address}}}`. |
| `settings.py` | Pydantic Settings with `PEQUOD_` env prefix. Reads `.env` file. |
| `models.py` | Pydantic v2 models for Allium API responses and internal `WhaleAlert` type. Uses typed unions for polymorphic assets/activities. |

### Frontend (`frontend/`)

React 19 + TypeScript + PixiJS 8 + Framer Motion + Tailwind 4, built with Vite 6.

Hybrid rendering: React UI + PixiJS canvas for the ocean map. Equirectangular projection (2000x1000px world). Entities from the watchlist appear as islands; whale alerts appear as animated sprites scaled by USD value (log scale).

Key components: `OceanMap` (PixiJS canvas with pan/zoom), `WhaleSprite` (alert visualization), `IslandMarker` (watchlist entities), `AlertFeed` (right sidebar with live alerts), `WalletInspector` (detail popups).

`useWhaleUpdates` hook manages the WebSocket connection with auto-reconnect.

Vite proxies `/api` → `http://localhost:8000` and `/ws` → `ws://localhost:8000` in dev mode.

### Environment

All backend config uses `PEQUOD_` prefix. Only `PEQUOD_ALLIUM_API_KEY` is required. See `.env.example` for all options. Telegram config is optional (frontend works without it). Redis is optional (falls back to in-memory dedup).

### Production Serving

In production, the FastAPI server serves the built frontend from `frontend/dist/` as static files (SPA mode). Single port 8000. The Docker image is a multi-stage build (Node for frontend, Python for backend).
