from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..auth import COOKIE_NAME, attach_session_headers, resolve_auth_token
from ..models import AuthRequest, User
from ..store import store


def build_auth_router(store_override=store) -> APIRouter:
    router = APIRouter(tags=["auth"])

    @router.get("/auth/me", response_model=User)
    def get_current_user(token: str | None = Depends(resolve_auth_token)):
        user = store_override.user_from_session(token)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        return user

    @router.post("/auth/sign-up", response_model=User, status_code=status.HTTP_201_CREATED)
    def sign_up(payload: AuthRequest, response: Response):
        try:
            user = store_override.create_user(payload.username, payload.password)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        token = store_override.create_session(user)
        attach_session_headers(response, token)
        return user

    @router.post("/auth/sign-in", response_model=User)
    def sign_in(payload: AuthRequest, response: Response):
        try:
            user = store_override.authenticate(payload.username, payload.password)
        except LookupError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
        token = store_override.create_session(user)
        attach_session_headers(response, token)
        return user

    @router.post("/auth/sign-out", status_code=status.HTTP_204_NO_CONTENT)
    def sign_out(response: Response, token: str | None = Depends(resolve_auth_token)):
        store_override.clear_session(token)
        response.delete_cookie(COOKIE_NAME, path="/")
        response.status_code = status.HTTP_204_NO_CONTENT
        return response

    return router


router = build_auth_router(store)
