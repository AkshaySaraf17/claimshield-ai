"""Request/response schemas for the appeals service."""

from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AppealCreate(BaseModel):
    claim_id: UUID
    letter_text: str | None = None
    policy_evidence: str | None = None
    confidence: float | None = None
    needs_review: bool = True


class AppealApprove(BaseModel):
    approved_by: str


class AppealResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    claim_id: UUID
    version: int
    letter_text: str | None
    policy_evidence: str | None
    confidence: float | None
    needs_review: bool
    approved_by: str | None
    approved_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
