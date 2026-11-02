"""Async SQLAlchemy engine and session factory."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .settings import get_settings


def create_engine():
    s = get_settings()
    return create_async_engine(
        s.database_url, echo=s.db_echo, pool_size=5, max_overflow=10
    )


def create_session_factory(engine=None):
    if engine is None:
        engine = create_engine()
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
