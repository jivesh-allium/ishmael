.PHONY: dev build run docker clean

# Build frontend + run everything locally
run: build
	uv run uvicorn pequod.server:app --host 0.0.0.0 --port 8000

# Build frontend only
build:
	cd frontend && npm install && npm run build

# Dev mode: frontend HMR + backend with reload (run in separate terminals, or use this)
dev:
	@echo "Starting backend and frontend dev servers..."
	@trap 'kill 0' EXIT; \
	uv run uvicorn pequod.server:app --reload --port 8000 & \
	cd frontend && npm run dev & \
	wait

# Docker: single image, single command
docker:
	docker build -t pequod .
	@echo "Run with: docker run -p 8000:8000 --env-file .env pequod"

# Clean build artifacts
clean:
	rm -rf frontend/dist frontend/node_modules
