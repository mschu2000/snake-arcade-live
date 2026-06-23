from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal

Mode = Literal["walls", "wrap"]
Direction = Literal["up", "down", "left", "right"]


@dataclass(frozen=True)
class Point:
    x: int
    y: int


@dataclass
class GameState:
    width: int
    height: int
    mode: Mode
    snake: list[Point]
    dir: Direction
    queuedDir: Direction
    food: Point
    score: int
    alive: bool
    tick: int


DIRS: dict[Direction, Point] = {
    "up": Point(0, -1),
    "down": Point(0, 1),
    "left": Point(-1, 0),
    "right": Point(1, 0),
}

OPPOSITE: dict[Direction, Direction] = {
    "up": "down",
    "down": "up",
    "left": "right",
    "right": "left",
}


def create_game(width: int = 22, height: int = 22, mode: Mode = "walls", rng: Callable[[], float] | None = None) -> GameState:
    rng = rng or __import__("random").random
    cx = width // 2
    cy = height // 2
    snake = [Point(cx, cy), Point(cx - 1, cy), Point(cx - 2, cy)]
    food = place_food(snake, width, height, rng)
    return GameState(
        width=width,
        height=height,
        mode=mode,
        snake=snake,
        dir="right",
        queuedDir="right",
        food=food,
        score=0,
        alive=True,
        tick=0,
    )


def place_food(snake: list[Point], width: int, height: int, rng: Callable[[], float]) -> Point:
    occupied = {(p.x, p.y) for p in snake}
    free = [Point(x, y) for y in range(height) for x in range(width) if (x, y) not in occupied]
    if not free:
        return Point(0, 0)
    return free[int(rng() * len(free))]


def turn(state: GameState, direction: Direction) -> GameState:
    if direction == OPPOSITE[state.dir]:
        return state
    state.queuedDir = direction
    return state


def step(state: GameState, rng: Callable[[], float] | None = None) -> GameState:
    rng = rng or __import__("random").random
    if not state.alive:
        return state

    direction = state.queuedDir
    delta = DIRS[direction]
    head = state.snake[0]
    nx = head.x + delta.x
    ny = head.y + delta.y

    if state.mode == "wrap":
        nx = (nx + state.width) % state.width
        ny = (ny + state.height) % state.height
    else:
        if nx < 0 or ny < 0 or nx >= state.width or ny >= state.height:
            state.alive = False
            state.dir = direction
            state.tick += 1
            return state

    ate_food = nx == state.food.x and ny == state.food.y
    new_snake = [Point(nx, ny), *state.snake]
    if not ate_food:
        new_snake.pop()

    if any(p.x == nx and p.y == ny for p in new_snake[1:]):
        state.alive = False
        state.dir = direction
        state.tick += 1
        return state

    if ate_food:
        state.food = place_food(new_snake, state.width, state.height, rng)
        state.score += 10

    state.snake = new_snake
    state.dir = direction
    state.tick += 1
    return state

