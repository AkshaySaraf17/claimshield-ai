"""Audit service — Kafka consumer + health endpoint."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from claimshield_common.auth import CurrentUser
from claimshield_common.db import create_engine, create_session_factory
from claimshield_common.models import AuditLog
from claimshield_common.tenancy import (
    bind_tenant_to_session,
    set_current_tenant,
)
from fastapi import FastAPI
from sqlalchemy import select

from .consumer import run_consumer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_consumer_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    engine = create_engine()
    sf = create_session_factory(engine)
    app.state.session_factory = sf

    _consumer_task = asyncio.create_task(run_consumer(sf))
    logger.info("Audit service started")
    yield
    if _consumer_task and not _consumer_task.done():
        _consumer_task.cancel()
    await engine.dispose()


app = FastAPI(title="ClaimShield Audit Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "consumer_running": _consumer_task is not None and not _consumer_task.done(),
    }


@app.get("/api/v1/audit/entries")
async def list_entries(
    user: CurrentUser,
    resource_type: str | None = None,
    resource_id: str | None = None,
    limit: int = 50,
):
    set_current_tenant(user.tenant_id)
    async with app.state.session_factory() as session:
        bind_tenant_to_session(session)
        q = select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)
        if resource_type:
            q = q.where(AuditLog.resource_type == resource_type)
        if resource_id:
            q = q.where(AuditLog.resource_id == resource_id)
        result = await session.execute(q)
        rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "action": r.action,
            "actor_id": r.actor_id,
            "actor_role": r.actor_role,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "detail": r.detail,
            "hash": r.hash,
            "prev_hash": r.prev_hash,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@app.get("/api/v1/audit/verify")
async def verify_chain(
    user: CurrentUser,
    limit: int = 100,
):
    """Verify the hash chain integrity for the tenant's recent audit entries."""
    set_current_tenant(user.tenant_id)
    async with app.state.session_factory() as session:
        bind_tenant_to_session(session)
        result = await session.execute(
            select(AuditLog).order_by(AuditLog.id.asc()).limit(limit)
        )
        rows = result.scalars().all()

    broken_at = None
    for i, row in enumerate(rows):
        expected_prev = rows[i - 1].hash if i > 0 else None
        if row.prev_hash != expected_prev:
            broken_at = row.id
            break

    return {
        "entries_checked": len(rows),
        "chain_valid": broken_at is None,
        "broken_at_id": broken_at,
    }
