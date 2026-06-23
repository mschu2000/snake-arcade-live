from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from ..auth import build_require_user
from ..models import LiveGame, User
from ..store import store


def build_games_router(store_override=store) -> APIRouter:
    router = APIRouter(tags=["games"])
    require_user = build_require_user(store_override)

    def json_line(data: object, event: str | None = None) -> str:
        payload = json.dumps(data, separators=(",", ":"))
        if event:
            return f"event: {event}\ndata: {payload}\n\n"
        return f"data: {payload}\n\n"

    @router.get("/games", response_model=list[LiveGame])
    def list_active_games():
        return store_override.list_active_games()

    @router.get("/games/stream")
    async def stream_active_games():
        async def event_stream():
            async for games in store_override.stream_active_games():
                yield json_line([game.model_dump(mode="json") for game in games], event="snapshot")

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @router.get("/games/{game_id}", response_model=LiveGame)
    def get_game(game_id: str):
        game = store_override.get_game(game_id)
        if not game:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
        return game

    @router.put("/games/{game_id}", response_model=LiveGame)
    def publish_game(game_id: str, game: LiveGame, user: User = Depends(require_user)):
        if game.id != game_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path gameId must match payload id")
        if not game.isBot and game.username != user.username:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot publish another user's game")
        return store_override.publish_game(game)

    @router.delete("/games/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
    def remove_game(game_id: str, user: User = Depends(require_user)):
        game = store_override.get_game(game_id)
        if not game:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
        if not game.isBot and game.username != user.username:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot remove another user's game")
        store_override.remove_game(game_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/games/{game_id}/stream")
    async def stream_game(game_id: str):
        if not store_override.get_game(game_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")

        async def event_stream():
            async for game in store_override.stream_game(game_id):
                yield json_line(None if game is None else game.model_dump(mode="json"), event="removed" if game is None else "snapshot")

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    return router


router = build_games_router(store)
