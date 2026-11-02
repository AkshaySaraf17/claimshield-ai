"""Multi-tenancy context — sets tenant_id for RLS and propagates it through
requests, events and database sessions."""

from __future__ import annotations

from contextvars import ContextVar
from uuid import UUID

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession

_current_tenant: ContextVar[UUID | None] = ContextVar("current_tenant", default=None)


def get_current_tenant() -> UUID:
    tid = _current_tenant.get()
    if tid is None:
        raise RuntimeError("No tenant context set — did the auth middleware run?")
    return tid


def set_current_tenant(tenant_id: UUID) -> None:
    _current_tenant.set(tenant_id)


def clear_tenant() -> None:
    _current_tenant.set(None)


def bind_tenant_to_session(session: AsyncSession) -> None:
    """After a connection is checked out, set the Postgres session variable
    that RLS policies read."""

    @event.listens_for(session.sync_session, "after_begin")
    def _set_tenant(session, transaction, connection):
        tid = _current_tenant.get()
        if tid is not None:
            connection.execute(
                text("SET LOCAL app.current_tenant_id = :tid"),
                {"tid": str(tid)},
            )
