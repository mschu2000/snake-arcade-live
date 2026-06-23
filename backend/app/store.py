from __future__ import annotations

import asyncio
import json
import secrets
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import AsyncIterator

from .models import LiveGame, Mode, ScoreEntry, SubmitScoreRequest, User
from .snake_engine import GameState, Point, create_game, step, turn

BOT_NAMES = ["NeonViper", "GlitchHydra", "PixelPython", "VaporBoa"]
COOKIE_NAME = "snake_session"


@dataclass
class StoredUser:
    id: str
    username: str
    password: str


@dataclass
class SnakeArenaStore:
    users_by_name: dict[str, StoredUser] = field(default_factory=dict)
    sessions: dict[str, str] = field(default_factory=dict)
    scores: list[ScoreEntry] = field(default_factory=list)
    games: dict[str, LiveGame] = field(default_factory=dict)
    game_subscribers: dict[str, set[asyncio.Queue[LiveGame | None]]] = field(default_factory=lambda: defaultdict(set))
    active_subscribers: set[asyncio.Queue[list[LiveGame]]] = field(default_factory=set)
    bot_task: asyncio.Task | None = None
    bot_states: list[dict[str, object]] = field(default_factory=list)

    def _uid(self) -> str:
        return secrets.token_urlsafe(8)

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def create_user(self, username: str, password: str) -> User:
        key = username.strip().lower()
        if key in self.users_by_name:
            raise ValueError("Username already taken")
        stored = StoredUser(id=self._uid(), username=username.strip(), password=password)
        self.users_by_name[key] = stored
        return User(id=stored.id, username=stored.username)

    def authenticate(self, username: str, password: str) -> User:
        stored = self.users_by_name.get(username.strip().lower())
        if not stored or stored.password != password:
            raise LookupError("Invalid username or password")
        return User(id=stored.id, username=stored.username)

    def create_session(self, user: User) -> str:
        token = secrets.token_urlsafe(24)
        self.sessions[token] = user.id
        return token

    def clear_session(self, token: str | None) -> None:
        if token:
            self.sessions.pop(token, None)

    def user_from_session(self, token: str | None) -> User | None:
        if not token:
            return None
        user_id = self.sessions.get(token)
        if not user_id:
            return None
        for stored in self.users_by_name.values():
            if stored.id == user_id:
                return User(id=stored.id, username=stored.username)
        return None

    def submit_score(self, user: User, payload: SubmitScoreRequest) -> ScoreEntry:
        entry = ScoreEntry(
            id=self._uid(),
            userId=user.id,
            username=user.username,
            mode=payload.mode,
            score=payload.score,
            createdAt=self._now_ms(),
        )
        self.scores.append(entry)
        return entry

    def get_leaderboard(self, mode: Mode, limit: int = 10) -> list[ScoreEntry]:
        return sorted(
            [score for score in self.scores if score.mode == mode],
            key=lambda s: (-s.score, s.createdAt),
        )[:limit]

    def list_active_games(self) -> list[LiveGame]:
        return sorted(self.games.values(), key=lambda g: g.state.score, reverse=True)

    def get_game(self, game_id: str) -> LiveGame | None:
        return self.games.get(game_id)

    def publish_game(self, game: LiveGame) -> LiveGame:
        self.games[game.id] = game
        self._notify_games()
        self._notify_game(game.id)
        return game

    def remove_game(self, game_id: str) -> None:
        if self.games.pop(game_id, None) is not None:
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
