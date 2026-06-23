from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import StaticPool

DEFAULT_DATABASE_URL = "postgresql+psycopg://postgres@localhost:5432/snake_arena"
DEFAULT_SQLITE_FALLBACK_URL = "sqlite:////tmp/snake_arena.db"
APP_TABLES = ("users", "sessions", "scores", "live_games")


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False)
    normalized_username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)


class SessionRow(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)


class ScoreRow(Base):
    __tablename__ = "scores"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False)
    mode: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    created_at: Mapped[int] = mapped_column(Integer, nullable=False, index=True)


class LiveGameRow(Base):
    __tablename__ = "live_games"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    state: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    is_bot: Mapped[bool] = mapped_column(Boolean, nullable=False, index=True)
    updated_at: Mapped[int] = mapped_column(Integer, nullable=False, index=True)


def make_engine(database_url: str):
    engine_kwargs: dict[str, object] = {}
    if database_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in database_url:
            engine_kwargs["poolclass"] = StaticPool
    return create_engine(database_url, future=True, **engine_kwargs)


def make_alembic_config() -> Config:
    config = Config()
    migrations_dir = Path(__file__).resolve().parents[1] / "migrations"
    config.set_main_option("script_location", str(migrations_dir))
    return config


def run_migrations(engine) -> None:
    """Upgrade the database schema to the latest available revision."""
    with engine.begin() as connection:
        config = make_alembic_config()
        config.attributes["connection"] = connection
        existing_tables = set(inspect(connection).get_table_names())
        if "alembic_version" not in existing_tables and set(APP_TABLES).issubset(existing_tables):
            command.stamp(config, "head")
            return
        command.upgrade(config, "head")
