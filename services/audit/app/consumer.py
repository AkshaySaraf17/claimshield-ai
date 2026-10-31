"""Kafka consumer that reads audit.events.v1 and writes hash-chained audit rows."""

from __future__ import annotations
import asyncio
import json
import logging
from datetime import datetime, timezone

from aiokafka import AIOKafkaConsumer
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from claimshield_common.models import AuditLog
from claimshield_common.settings import get_settings
from .hasher import compute_hash

logger = logging.getLogger(__name__)


async def _get_last_hash(session: AsyncSession, tenant_id: str) -> str | None:
    result = await session.execute(
        select(AuditLog.hash)
        .where(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.id.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row


async def process_event(session: AsyncSession, raw: bytes) -> None:
    event = json.loads(raw)

    tenant_id = event.get("tenantid") or event.get("tenant_id", "")
    actor_id = event.get("actor_id", "system")
    actor_role = event.get("actor_role", "system")
    action = event.get("action", event.get("type", "unknown"))
    resource_type = event.get("resource_type", "")
    resource_id = event.get("resource_id", "")
    detail = event.get("data") or event.get("detail")
    timestamp = event.get("time", datetime.now(timezone.utc).isoformat())

    prev_hash = await _get_last_hash(session, tenant_id)

    entry_hash = compute_hash(
        prev_hash=prev_hash,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        timestamp=timestamp,
    )

    entry = AuditLog(
        tenant_id=tenant_id,
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        prev_hash=prev_hash,
        hash=entry_hash,
    )
    session.add(entry)
    await session.commit()
    logger.info("Audit entry %s action=%s resource=%s/%s", entry_hash[:12], action, resource_type, resource_id)


async def run_consumer(session_factory) -> None:
    settings = get_settings()
    consumer = AIOKafkaConsumer(
        "audit.events.v1",
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id="audit-service",
        auto_offset_reset="earliest",
        enable_auto_commit=False,
    )
    await consumer.start()
    logger.info("Audit consumer started on audit.events.v1")
    try:
        async for msg in consumer:
            try:
                async with session_factory() as session:
                    await process_event(session, msg.value)
                await consumer.commit()
            except Exception:
                logger.exception("Failed to process audit event at offset %s", msg.offset)
    finally:
        await consumer.stop()
