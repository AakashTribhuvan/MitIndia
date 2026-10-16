"""Alembic environment: uses the SignLine Emergency engine and models."""

from alembic import context

from signline_emergency import models  # noqa: F401  (registers the tables)
from signline_emergency.config import get_settings
from signline_emergency.db import Base, get_engine

target_metadata = Base.metadata


def run_offline() -> None:
    context.configure(url=get_settings().database_url, target_metadata=target_metadata, literal_binds=True,
                      render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    with get_engine().connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
        connection.commit()


if context.is_offline_mode():
    run_offline()
else:
    run_online()
