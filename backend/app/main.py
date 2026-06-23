from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.auth import build_auth_router
from .routers.games import build_games_router
from .routers.leaderboard import build_leaderboard_router
from .store import SnakeArenaStore, store


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
    app.state.store = app_store
    return app


app = create_app(store)
