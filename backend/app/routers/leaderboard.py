from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import build_require_user
from ..models import Mode, ScoreEntry, SubmitScoreRequest, User
from ..store import store


def build_leaderboard_router(store_override=store) -> APIRouter:
    router = APIRouter(tags=["leaderboard"])
    require_user = build_require_user(store_override)

    @router.get("/leaderboard/{mode}", response_model=list[ScoreEntry])
    def get_leaderboard(mode: Mode, limit: int = 10):
        if limit < 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="limit must be >= 1")
        return store_override.get_leaderboard(mode, limit)

    @router.post("/scores", response_model=ScoreEntry, status_code=status.HTTP_201_CREATED)
    def submit_score(payload: SubmitScoreRequest, user: User = Depends(require_user)):
        return store_override.submit_score(user, payload)

    return router


router = build_leaderboard_router(store)
