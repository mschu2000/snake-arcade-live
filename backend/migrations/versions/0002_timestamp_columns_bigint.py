"""use bigint for millisecond timestamps

Revision ID: 0002_timestamp_columns_bigint
Revises: 0001_initial_schema
Create Date: 2026-06-23 00:00:01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_timestamp_columns_bigint"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("scores") as batch:
            batch.alter_column("created_at", existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False)
        with op.batch_alter_table("live_games") as batch:
            batch.alter_column("updated_at", existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False)
        return

    op.alter_column("scores", "created_at", existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False)
    op.alter_column("live_games", "updated_at", existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("live_games") as batch:
            batch.alter_column("updated_at", existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=False)
        with op.batch_alter_table("scores") as batch:
            batch.alter_column("created_at", existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=False)
        return

    op.alter_column("live_games", "updated_at", existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=False)
    op.alter_column("scores", "created_at", existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=False)
