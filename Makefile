.PHONY: install backend frontend backend-tests frontend-tests test

install:
	cd backend && uv sync
	cd frontend && npm ci

backend:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd frontend && npm run dev

backend-tests:
	cd backend && uv run pytest -q

frontend-tests:
	cd frontend && npm test

test: backend-tests frontend-tests
