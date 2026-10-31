"""Request/response schemas for the claims service."""

from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


VALID_STATUSES = frozenset({
    "pending_review", "in_progress", "needs_review",
    "approved", "sent", "won", "lost", "cancelled",
})

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending_review": {"in_progress", "cancelled"},
    "in_progress": {"needs_review", "cancelled"},
    "needs_review": {"approved", "in_progress", "cancelled"},
    "approved": {"sent", "cancelled"},
    "sent": {"won", "lost"},
    "won": set(),
    "lost": {"in_progress"},
    "cancelled": set(),
}


class ClaimCreate(BaseModel):
    clinic_id: UUID
    patient_id: UUID | None = None
    claim_number: str | None = None
    payer_name: str | None = None
    denial_code: str | None = None
    denial_reason: str | None = None
    raw_denial_text: str
    raw_clinical_notes: str
    amount_denied_cents: int | None = None


class ClaimUpdate(BaseModel):
    payer_name: str | None = None
    denial_code: str | None = None
    denial_reason: str | None = None
    amount_denied_cents: int | None = None
    amount_approved_cents: int | None = None


class StatusTransition(BaseModel):
    status: str
    reviewed_by: str | None = None


class ClaimResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    clinic_id: UUID
    patient_id: UUID | None
    claim_number: str | None
    payer_name: str | None
    denial_code: str | None
    denial_reason: str | None
    raw_denial_text: str
    raw_clinical_notes: str
    amount_denied_cents: int | None
    amount_approved_cents: int | None
    status: str
    reviewed_by: str | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
