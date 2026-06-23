from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

from .routers.auth import build_auth_router
from .routers.games import build_games_router
from .routers.leaderboard import build_leaderboard_router
from .store import SnakeArenaStore, store

FRONTEND_DIST_DIR = Path(
    os.getenv("FRONTEND_DIST_DIR")
    or Path(__file__).resolve().parents[2] / "frontend" / "dist" / "client"
)


def _frontend_assets_dir() -> Path:
    return FRONTEND_DIST_DIR / "assets"


def _find_frontend_asset(pattern: str) -> Path | None:
    assets_dir = _frontend_assets_dir()
    if not assets_dir.is_dir():
        return None
    matches = sorted(assets_dir.glob(pattern))
    return matches[0] if matches else None


def _render_frontend_shell(path: str) -> HTMLResponse | FileResponse:
    client_entry = _find_frontend_asset("index-*.js")
    if client_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Frontend build not found at {_frontend_assets_dir()}",
        )

    if path:
        requested_file = FRONTEND_DIST_DIR / path
        if requested_file.is_dir():
            requested_file = requested_file / "index.html"
        if requested_file.is_file():
            return FileResponse(requested_file)
        if requested_file.suffix:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    # Let real API/docs routes return their own 404s instead of the SPA shell.
    if path.startswith(("auth", "games", "leaderboard", "scores", "docs", "redoc", "openapi.json")):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    stylesheet = _find_frontend_asset("styles-*.css")
    stylesheet_href = f"/assets/{stylesheet.name}" if stylesheet else None

    head_links = [
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        '<title>Snake Arena</title>',
        '<meta name="description" content="Snake Arena multiplayer game." />',
        '<link rel="preconnect" href="https://fonts.googleapis.com" />',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
        '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />',
    ]
    if stylesheet_href is not None:
        head_links.insert(3, f'<link rel="stylesheet" href="{stylesheet_href}" />')

    html = "\n".join(
        [
            "<!doctype html>",
            '<html lang="en">',
            "<head>",
            *head_links,
            "</head>",
            "<body>",
            f'<script type="module" src="/assets/{client_entry.name}"></script>',
            "</body>",
            "</html>",
        ]
    )
    return HTMLResponse(html)


def create_app(
    store_override: SnakeArenaStore | None = None,
    *,
    seed_demo_data: bool = True,
    seed_bots: bool = True,
    start_bots: bool = True,
) -> FastAPI:
    app_store = store_override or store

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if seed_demo_data:
            app_store.seed_demo_data()
        if seed_bots:
            app_store.seed_bots()
        task = asyncio.create_task(app_store.run_bots()) if start_bots else None
        app_store.bot_task = task
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    app = FastAPI(title="Snake Arena API", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:4173", "http://localhost:3000", "*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(build_auth_router(app_store))
    app.include_router(build_leaderboard_router(app_store))
    app.include_router(build_games_router(app_store))

    @app.get("/", include_in_schema=False)
    @app.get("/{path:path}", include_in_schema=False)
    def serve_frontend(path: str = ""):
        return _render_frontend_shell(path)

    app.state.store = app_store
    return app


app = create_app(store)
