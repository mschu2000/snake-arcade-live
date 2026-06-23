.DEFAULT_GOAL := help
.PHONY: install backend frontend dev backend-tests frontend-tests test docker-build docker-run help

PORT ?= 8000
CONTAINER_ENGINE ?= podman
POSTGRES_HOST ?= host.containers.internal
POSTGRES_PORT ?= 5432
POSTGRES_USER ?= snakearena
POSTGRES_PASSWORD ?= snakearena
POSTGRES_DB ?= snakearena
DATABASE_URL ?= postgresql+psycopg://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@$(POSTGRES_HOST):$(POSTGRES_PORT)/$(POSTGRES_DB)

help:
	@printf '%s\n' \
		'install         Sync backend + frontend dependencies' \
		'backend         Run backend dev server' \
		'frontend        Run frontend dev server' \
		'dev             Run backend + frontend together' \
		'backend-tests   Run backend tests' \
		'frontend-tests  Run frontend tests' \
		'test            Run all tests' \
		'test-integration Run backend integration tests' \
		'docker-build    Build the Docker image' \
		'docker-run      Run the Docker image (override PORT=...)'

install:
	cd backend && uv sync
	cd frontend && npm ci

backend:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd frontend && npm run dev

dev:
	@set -e; \
	( cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 ) & \
	backend_pid=$$!; \
	( cd frontend && npm run dev ) & \
	frontend_pid=$$!; \
	trap 'kill $$backend_pid $$frontend_pid 2>/dev/null || true' INT TERM EXIT; \
	wait $$backend_pid $$frontend_pid

backend-tests:
	cd backend && uv run pytest -q

frontend-tests:
	cd frontend && npm test

test: backend-tests frontend-tests

test-integration:
	cd backend && uv run pytest tests_integration/

docker-build:
	$(CONTAINER_ENGINE) build -f Dockerfile -t snake-arena .

docker-run:
	$(CONTAINER_ENGINE) run --rm -p $(PORT):8000 -e DATABASE_URL="$(DATABASE_URL)" snake-arena
