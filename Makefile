.DEFAULT_GOAL := help
.PHONY: install backend frontend dev backend-tests frontend-tests test docker-build docker-run podman-up podman-down podman-logs help

PORT ?= 8000
CONTAINER_ENGINE ?= podman
APP_CONTAINER_NAME ?= snake-arena-app
POSTGRES_CONTAINER_NAME ?= snake-db
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

podman-up:
	@set -e; \
	$(CONTAINER_ENGINE) rm -f $(APP_CONTAINER_NAME) $(POSTGRES_CONTAINER_NAME) >/dev/null 2>&1 || true; \
	$(CONTAINER_ENGINE) run -d --replace --name $(POSTGRES_CONTAINER_NAME) \
		-e POSTGRES_USER=$(POSTGRES_USER) \
		-e POSTGRES_PASSWORD=$(POSTGRES_PASSWORD) \
		-e POSTGRES_DB=$(POSTGRES_DB) \
		-p $(POSTGRES_PORT):5432 \
		-v snake_pgdata:/var/lib/postgresql/data \
		postgres:16-alpine >/dev/null; \
	until $(CONTAINER_ENGINE) exec $(POSTGRES_CONTAINER_NAME) pg_isready -U $(POSTGRES_USER) -d $(POSTGRES_DB) >/dev/null 2>&1; do \
		sleep 1; \
	done; \
	$(CONTAINER_ENGINE) build -f Dockerfile -t snake-arena .; \
	$(CONTAINER_ENGINE) run -d --replace --name $(APP_CONTAINER_NAME) --rm \
		-p $(PORT):8000 \
		-e DATABASE_URL="$(DATABASE_URL)" \
		snake-arena >/dev/null; \
	for i in $$(seq 1 60); do \
		if curl -fsS "http://127.0.0.1:$(PORT)/openapi.json" >/dev/null 2>&1; then \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	$(CONTAINER_ENGINE) logs --tail 120 $(APP_CONTAINER_NAME); \
	echo "App did not become ready on http://127.0.0.1:$(PORT)" >&2; \
	exit 1

podman-down:
	-$(CONTAINER_ENGINE) rm -f $(APP_CONTAINER_NAME) $(POSTGRES_CONTAINER_NAME)

podman-logs:
	$(CONTAINER_ENGINE) logs -f $(APP_CONTAINER_NAME)
