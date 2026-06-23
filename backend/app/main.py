from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.auth import router as auth_router
from .routers.games import router as games_router
from .routers.leaderboard import router as leaderboard_router
from .store import store


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.seed_demo_data()
    store.seed_bots()
    task = asyncio.create_task(store.run_bots())
    store.bot_task = task
    try:
        yield
    finally:
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

app.include_router(auth_router)
app.include_router(leaderboard_router)
app.include_router(games_router)

