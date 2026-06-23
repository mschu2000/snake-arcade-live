from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import time
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Iterator

from sqlalchemy.exc import OperationalError
from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session, sessionmaker

from .auth import hash_password, verify_password
from .db import (
    DEFAULT_DATABASE_URL,
    DEFAULT_SQLITE_FALLBACK_URL,
    LiveGameRow,
    ScoreRow,
    SessionRow,
    UserRow,
    make_engine,
    run_migrations,
)
from .models import LiveGame, Mode, ScoreEntry, SubmitScoreRequest, User
from .snake_engine import GameState, Point, create_game, step, turn

BOT_NAMES = ["NeonViper", "GlitchHydra", "PixelPython", "VaporBoa"]
logger = logging.getLogger(__name__)


@dataclass
class SnakeArenaStore:
    database_url: str | None = None

    def __post_init__(self) -> None:
        self.database_url = self.database_url or os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
        self.engine = make_engine(self.database_url)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)
        try:
            run_migrations(self.engine)
        except OperationalError:
            if self.database_url != DEFAULT_DATABASE_URL:
                raise
            logger.warning("Database unavailable at %s; falling back to %s", DEFAULT_DATABASE_URL, DEFAULT_SQLITE_FALLBACK_URL)
            self.database_url = DEFAULT_SQLITE_FALLBACK_URL
            self.engine = make_engine(self.database_url)
            self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)
            run_migrations(self.engine)
        logger.info("Using database URL: %s", self.database_url)
        self.game_subscribers: dict[str, set[asyncio.Queue[LiveGame | None]]] = defaultdict(set)
        self.active_subscribers: set[asyncio.Queue[list[LiveGame]]] = set()
        self.bot_task: asyncio.Task | None = None
        self.bot_states: list[dict[str, object]] = []

    def _uid(self) -> str:
        return secrets.token_urlsafe(8)

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    @contextmanager
    def _session(self) -> Iterator[Session]:
        session = self.session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @staticmethod
    def _normalize_username(username: str) -> str:
        return username.strip().lower()

    @staticmethod
    def _user_from_row(row: UserRow) -> User:
        return User(id=row.id, username=row.username)

    @staticmethod
    def _score_from_row(row: ScoreRow) -> ScoreEntry:
        return ScoreEntry(
            id=row.id,
            userId=row.user_id,
            username=row.username,
            mode=row.mode,  # type: ignore[arg-type]
            score=row.score,
            createdAt=row.created_at,
        )

    @staticmethod
    def _live_game_from_row(row: LiveGameRow) -> LiveGame:
        state = row.state
        if isinstance(state, str):
            state = json.loads(state)
        return LiveGame(
            id=row.id,
            username=row.username,
            mode=row.mode,  # type: ignore[arg-type]
            state=state,  # type: ignore[arg-type]
            isBot=row.is_bot,
            updatedAt=row.updated_at,
        )

    def create_user(self, username: str, password: str) -> User:
        normalized = self._normalize_username(username)
        with self._session() as session:
            existing = session.scalar(select(UserRow).where(UserRow.normalized_username == normalized))
            if existing:
                raise ValueError("Username already taken")
            stored = UserRow(
                id=self._uid(),
                username=username.strip(),
                normalized_username=normalized,
                password_hash=hash_password(password),
            )
            session.add(stored)
            session.flush()
            return self._user_from_row(stored)

    def authenticate(self, username: str, password: str) -> User:
        normalized = self._normalize_username(username)
        with self._session() as session:
            stored = session.scalar(select(UserRow).where(UserRow.normalized_username == normalized))
            if not stored or not verify_password(password, stored.password_hash):
                raise LookupError("Invalid username or password")
            return self._user_from_row(stored)

    def get_user_row(self, username: str) -> UserRow | None:
        normalized = self._normalize_username(username)
        with self._session() as session:
            return session.scalar(select(UserRow).where(UserRow.normalized_username == normalized))

    def create_session(self, user: User) -> str:
        token = secrets.token_urlsafe(24)
        with self._session() as session:
            session.add(SessionRow(token=token, user_id=user.id))
        return token

    def clear_session(self, token: str | None) -> None:
        if not token:
            return
        with self._session() as session:
            session.execute(delete(SessionRow).where(SessionRow.token == token))

    def user_from_session(self, token: str | None) -> User | None:
        if not token:
            return None
        with self._session() as session:
            row = session.scalar(
                select(UserRow)
                .join(SessionRow, SessionRow.user_id == UserRow.id)
                .where(SessionRow.token == token)
            )
            return self._user_from_row(row) if row else None

    def submit_score(self, user: User, payload: SubmitScoreRequest) -> ScoreEntry:
        entry = ScoreRow(
            id=self._uid(),
            user_id=user.id,
            username=user.username,
            mode=payload.mode,
            score=payload.score,
            created_at=self._now_ms(),
        )
        with self._session() as session:
            session.add(entry)
            session.flush()
            return self._score_from_row(entry)

    def get_leaderboard(self, mode: Mode, limit: int = 10) -> list[ScoreEntry]:
        with self._session() as session:
            rows = session.scalars(
                select(ScoreRow).where(ScoreRow.mode == mode).order_by(desc(ScoreRow.score), ScoreRow.created_at).limit(limit)
            ).all()
            return [self._score_from_row(row) for row in rows]

    def list_active_games(self) -> list[LiveGame]:
        with self._session() as session:
            rows = session.scalars(select(LiveGameRow)).all()
            games = [self._live_game_from_row(row) for row in rows]
            return sorted(games, key=lambda g: g.state.score, reverse=True)

    def get_game(self, game_id: str) -> LiveGame | None:
        with self._session() as session:
            row = session.get(LiveGameRow, game_id)
            return self._live_game_from_row(row) if row else None

    def publish_game(self, game: LiveGame) -> LiveGame:
        with self._session() as session:
            row = session.get(LiveGameRow, game.id)
            if row is None:
                row = LiveGameRow(
                    id=game.id,
                    username=game.username,
                    mode=game.mode,
                    state=game.state.model_dump(mode="json"),
                    is_bot=game.isBot,
                    updated_at=game.updatedAt,
                )
                session.add(row)
            else:
                row.username = game.username
                row.mode = game.mode
                row.state = game.state.model_dump(mode="json")
                row.is_bot = game.isBot
                row.updated_at = game.updatedAt
            session.flush()
        self._notify_games()
        self._notify_game(game.id)
        return game

    def remove_game(self, game_id: str) -> None:
        removed = False
        with self._session() as session:
            row = session.get(LiveGameRow, game_id)
            if row is not None:
                session.delete(row)
                removed = True
        if removed:
            self._notify_games()
            self._notify_game(game_id)

    def _notify_games(self) -> None:
        snapshot = self.list_active_games()
        for queue in list(self.active_subscribers):
            queue.put_nowait(snapshot)

    def _notify_game(self, game_id: str) -> None:
        game = self.get_game(game_id)
        for queue in list(self.game_subscribers.get(game_id, set())):
            queue.put_nowait(game)

    async def stream_active_games(self) -> AsyncIterator[list[LiveGame]]:
        queue: asyncio.Queue[list[LiveGame]] = asyncio.Queue()
        self.active_subscribers.add(queue)
        try:
            await queue.put(self.list_active_games())
            while True:
                yield await queue.get()
        finally:
            self.active_subscribers.discard(queue)

    async def stream_game(self, game_id: str) -> AsyncIterator[LiveGame | None]:
        queue: asyncio.Queue[LiveGame | None] = asyncio.Queue()
        self.game_subscribers[game_id].add(queue)
        try:
            await queue.put(self.get_game(game_id))
            while True:
                yield await queue.get()
        finally:
            self.game_subscribers[game_id].discard(queue)
            if not self.game_subscribers[game_id]:
                self.game_subscribers.pop(game_id, None)

    def seed_demo_data(self) -> None:
        with self._session() as session:
            has_users = session.scalar(select(UserRow.id).limit(1)) is not None
        if has_users:
            return

        users = {
            "ava": self.create_user("ava", "pass1234"),
            "milo": self.create_user("milo", "pass1234"),
            "sara": self.create_user("sara", "pass1234"),
        }
        self.submit_score(users["ava"], SubmitScoreRequest(mode="walls", score=140))
        self.submit_score(users["milo"], SubmitScoreRequest(mode="walls", score=90))
        self.submit_score(users["sara"], SubmitScoreRequest(mode="wrap", score=110))
        self.publish_game(
            LiveGame(
                id="demo-ava",
                username="ava",
                mode="walls",
                state=to_live_state(create_game(mode="walls")),
                isBot=False,
                updatedAt=self._now_ms(),
            )
        )
        self.publish_game(
            LiveGame(
                id="demo-milo",
                username="milo",
                mode="wrap",
                state=to_live_state(create_game(mode="wrap")),
                isBot=False,
                updatedAt=self._now_ms(),
            )
        )

    def seed_bots(self) -> None:
        if self.bot_states:
            return
        for index, name in enumerate(BOT_NAMES):
            mode: Mode = "wrap" if index % 2 == 0 else "walls"
            self.bot_states.append(
                {
                    "id": f"bot-{index}",
                    "name": name,
                    "mode": mode,
                    "state": create_game(mode=mode),
                }
            )

    def reset_for_tests(self) -> None:
        with self._session() as session:
            session.execute(delete(SessionRow))
            session.execute(delete(ScoreRow))
            session.execute(delete(LiveGameRow))
            session.execute(delete(UserRow))
        self.game_subscribers.clear()
        self.active_subscribers.clear()
        self.bot_states.clear()

    async def run_bots(self) -> None:
        self.seed_bots()
        while True:
            for bot in self.bot_states:
                state: GameState = bot["state"]  # type: ignore[assignment]
                direction = choose_bot_dir(state)
                turn(state, direction)
                step(state)
                if not state.alive:
                    bot["state"] = create_game(mode=bot["mode"])  # type: ignore[arg-type]
                    state = bot["state"]
                live_game = LiveGame(
                    id=bot["id"],  # type: ignore[arg-type]
                    username=bot["name"],  # type: ignore[arg-type]
                    mode=bot["mode"],  # type: ignore[arg-type]
                    state=to_live_state(state),
                    isBot=True,
                    updatedAt=self._now_ms(),
                )
                self.publish_game(live_game)
            await asyncio.sleep(0.18)


def to_live_state(state: GameState) -> dict[str, object]:
    return {
        "width": state.width,
        "height": state.height,
        "mode": state.mode,
        "snake": [{"x": point.x, "y": point.y} for point in state.snake],
        "dir": state.dir,
        "queuedDir": state.queuedDir,
        "food": {"x": state.food.x, "y": state.food.y},
        "score": state.score,
        "alive": state.alive,
        "tick": state.tick,
    }


def choose_bot_dir(state: GameState) -> str:
    head = state.snake[0]
    food = state.food
    candidates: list[str] = []
    if food.x < head.x:
        candidates.append("left")
    if food.x > head.x:
        candidates.append("right")
    if food.y < head.y:
        candidates.append("up")
    if food.y > head.y:
        candidates.append("down")
    all_dirs = ["up", "down", "left", "right"]
    order = candidates + [d for d in all_dirs if d not in candidates]
    body = {(p.x, p.y) for p in state.snake}
    for direction in order:
        next_point = next_head(head, direction, state)
        if next_point is None:
            continue
        if (next_point.x, next_point.y) in body:
            continue
        return direction
    return state.dir


def next_head(head: Point, direction: str, state: GameState) -> Point | None:
    delta = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}[direction]
    x = head.x + delta[0]
    y = head.y + delta[1]
    if state.mode == "wrap":
        x %= state.width
        y %= state.height
        return Point(x, y)
    if x < 0 or y < 0 or x >= state.width or y >= state.height:
        return None
    return Point(x, y)


store = SnakeArenaStore()
