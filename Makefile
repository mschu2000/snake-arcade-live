.PHONY: install backend frontend dev backend-tests frontend-tests test docker-build docker-run

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
	docker build -f backend/Dockerfile -t snake-arena .

docker-run:
	docker run --rm -p 8000:8000 snake-arena
