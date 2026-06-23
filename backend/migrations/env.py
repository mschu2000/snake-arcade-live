from __future__ import annotations

from logging.config import fileConfig
import os

from alembic import context

from app.db import Base, DEFAULT_DATABASE_URL, make_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url") or _url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = config.attributes.get("connection")
    if connectable is None:
        url = config.get_main_option("sqlalchemy.url") or _url()
        connectable = make_engine(url)
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
                render_as_batch=connection.dialect.name == "sqlite",
            )
            with context.begin_transaction():
                context.run_migrations()
        connectable.dispose()
        return

    context.configure(
        connection=connectable,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=connectable.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
