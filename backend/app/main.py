from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .models import AuthRequest, ErrorResponse, LiveGame, Mode, ScoreEntry, SubmitScoreRequest, User
from .snake_engine import GameState
from .store import COOKIE_NAME, SnakeArenaStore, to_live_state

store = SnakeArenaStore()


def auth_cookie_token(snake_session: str | None = Cookie(default=None)) -> str | None:
    return snake_session


def require_user(token: str | None = Depends(auth_cookie_token)) -> User:
    user = store.user_from_session(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


def json_line(data: object, event: str | None = None) -> str:
    payload = json.dumps(data, separators=(",", ":"))
    if event:
        return f"event: {event}\ndata: {payload}\n\n"
    return f"data: {payload}\n\n"


@asynccontextmanager
async def lifespan(app: FastAPI):
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


@app.get("/auth/me", response_model=User)
def get_current_user(token: str | None = Depends(auth_cookie_token)):
    user = store.user_from_session(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


@app.post("/auth/sign-up", response_model=User, status_code=status.HTTP_201_CREATED)
def sign_up(payload: AuthRequest, response: Response):
    try:
        user = store.create_user(payload.username, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    token = store.create_session(user)
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax", path="/")
    return user


@app.post("/auth/sign-in", response_model=User)
def sign_in(payload: AuthRequest, response: Response):
    try:
        user = store.authenticate(payload.username, payload.password)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    token = store.create_session(user)
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax", path="/")
    return user


@app.post("/auth/sign-out", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(response: Response, token: str | None = Depends(auth_cookie_token)):
    store.clear_session(token)
    response.delete_cookie(COOKIE_NAME, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@app.get("/leaderboard/{mode}", response_model=list[ScoreEntry])
def get_leaderboard(mode: Mode, limit: int = 10):
    if limit < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="limit must be >= 1")
    return store.get_leaderboard(mode, limit)


@app.post("/scores", response_model=ScoreEntry, status_code=status.HTTP_201_CREATED)
def submit_score(payload: SubmitScoreRequest, user: User = Depends(require_user)):
    return store.submit_score(user, payload)


@app.get("/games", response_model=list[LiveGame])
def list_active_games():
    return store.list_active_games()


@app.get("/games/{game_id}", response_model=LiveGame)
def get_game(game_id: str):
    game = store.get_game(game_id)
    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    return game


@app.put("/games/{game_id}", response_model=LiveGame)
def publish_game(game_id: str, game: LiveGame, user: User = Depends(require_user)):
    if game.id != game_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path gameId must match payload id")
    if not game.isBot and game.username != user.username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot publish another user's game")
    return store.publish_game(game)


@app.delete("/games/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_game(game_id: str, user: User = Depends(require_user)):
    game = store.get_game(game_id)
    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    if not game.isBot and game.username != user.username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot remove another user's game")
    store.remove_game(game_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/games/stream")
async def stream_active_games():
    async def event_stream():
        async for games in store.stream_active_games():
            yield json_line([game.model_dump(mode="json") for game in games], event="snapshot")

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/games/{game_id}/stream")
async def stream_game(game_id: str):
    async def event_stream():
        async for game in store.stream_game(game_id):
            yield json_line(None if game is None else game.model_dump(mode="json"), event="removed" if game is None else "snapshot")

    return StreamingResponse(event_stream(), media_type="text/event-stream")
