# Stage 1: Build frontend
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python backend + built frontend
FROM python:3.12-slim
WORKDIR /app

COPY pyproject.toml .
COPY pequod/ pequod/
RUN pip install --no-cache-dir .

# Copy built frontend into where server.py expects it
COPY --from=frontend /app/frontend/dist frontend/dist/

EXPOSE 8000
CMD ["uvicorn", "pequod.server:app", "--host", "0.0.0.0", "--port", "8000"]
