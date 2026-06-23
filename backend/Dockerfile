FROM node:22-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS backend-runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    FRONTEND_DIST_DIR=/app/backend/static

RUN useradd --create-home --uid 10001 appuser && mkdir -p /app && chown appuser:appuser /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

USER appuser

ENV PATH=/home/appuser/.local/bin:$PATH

RUN python -m pip install --user --no-cache-dir uv

COPY --chown=appuser:appuser backend/pyproject.toml backend/uv.lock ./backend/
COPY --chown=appuser:appuser frontend/package*.json ./backend/static/

WORKDIR /app/backend
RUN uv sync --frozen --no-dev --no-install-project

WORKDIR /app/backend/static
RUN npm ci --omit=dev

WORKDIR /app/backend
COPY --chown=appuser:appuser backend/ ./
COPY --from=frontend-build --chown=appuser:appuser /app/frontend/dist/client ./static/client
COPY --from=frontend-build --chown=appuser:appuser /app/frontend/dist/server ./static/server

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
