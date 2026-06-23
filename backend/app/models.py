from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Mode = Literal["walls", "wrap"]
Direction = Literal["up", "down", "left", "right"]


class User(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    username: str = Field(min_length=2)


class AuthRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=2)
    password: str = Field(min_length=4)


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int = Field(ge=0)
    y: int = Field(ge=0)


class GameState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = Field(ge=1)
    height: int = Field(ge=1)
    mode: Mode
    snake: list[Point]
    dir: Direction
    queuedDir: Direction
    food: Point
    score: int = Field(ge=0)
    alive: bool
    tick: int = Field(ge=0)


class ScoreEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    userId: str
    username: str
    mode: Mode
    score: int = Field(ge=0)
    createdAt: int


class LiveGame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    username: str
    mode: Mode
    state: GameState
    isBot: bool
    updatedAt: int


class SubmitScoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Mode
    score: int = Field(ge=0)


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    message: str
    error: Optional[str] = None

