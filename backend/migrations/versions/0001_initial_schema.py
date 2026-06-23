"""initial schema

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-06-23 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("normalized_username", sa.String(length=80), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
    )

    op.create_table(
        "sessions",
        sa.Column("token", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_index(op.f("ix_sessions_user_id"), "sessions", ["user_id"], unique=False)

    op.create_table(
        "scores",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("user_id", sa.String(length=32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("mode", sa.String(length=8), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
    )
    op.create_index(op.f("ix_scores_created_at"), "scores", ["created_at"], unique=False)
    op.create_index(op.f("ix_scores_mode"), "scores", ["mode"], unique=False)
    op.create_index(op.f("ix_scores_score"), "scores", ["score"], unique=False)
    op.create_index(op.f("ix_scores_user_id"), "scores", ["user_id"], unique=False)

    op.create_table(
        "live_games",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("mode", sa.String(length=8), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("is_bot", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
    )
    op.create_index(op.f("ix_live_games_is_bot"), "live_games", ["is_bot"], unique=False)
    op.create_index(op.f("ix_live_games_mode"), "live_games", ["mode"], unique=False)
    op.create_index(op.f("ix_live_games_updated_at"), "live_games", ["updated_at"], unique=False)
    op.create_index(op.f("ix_live_games_username"), "live_games", ["username"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_live_games_updated_at"), table_name="live_games")
    op.drop_index(op.f("ix_live_games_mode"), table_name="live_games")
    op.drop_index(op.f("ix_live_games_is_bot"), table_name="live_games")
    op.drop_index(op.f("ix_live_games_username"), table_name="live_games")
    op.drop_table("live_games")

    op.drop_index(op.f("ix_scores_user_id"), table_name="scores")
    op.drop_index(op.f("ix_scores_score"), table_name="scores")
    op.drop_index(op.f("ix_scores_mode"), table_name="scores")
    op.drop_index(op.f("ix_scores_created_at"), table_name="scores")
    op.drop_table("scores")

    op.drop_index(op.f("ix_sessions_user_id"), table_name="sessions")
    op.drop_table("sessions")

    op.drop_table("users")
