"""CloudEvents envelope and transactional outbox helpers."""

from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase


class CloudEvent(BaseModel):
    """Minimal CloudEvents v1.0 envelope."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source: str
    type: str
    subject: str | None = None
    time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    datacontenttype: str = "application/json"
    data: dict[str, Any] = Field(default_factory=dict)
    tenantid: str | None = None


class OutboxBase(DeclarativeBase):
    pass


class OutboxEntry(OutboxBase):
    """Transactional outbox table — Debezium reads this via CDC."""
    __tablename__ = "outbox"

    id = Column(PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    aggregatetype = Column(String(255), nullable=False)
    aggregateid = Column(String(255), nullable=False)
    type = Column(String(255), nullable=False)
    payload = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
