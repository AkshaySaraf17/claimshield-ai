"""Standalone dev server — claims + appeals + audit on SQLite.

Run:  PYTHONPATH="$PWD" .venv/bin/uvicorn services.dev_server.main:app --port 8003 --reload
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base, Tenant, Clinic, Claim, Appeal, AuditLog
from .seed import DEV_TENANT_ID, DEV_CLINIC_ID, DEV_USER_ID, build_seed_objects

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "dev.db"
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app.state.session_factory = sf

    async with sf() as session:
        existing = await session.execute(select(Tenant).limit(1))
        if existing.scalar_one_or_none() is None:
            logger.info("Seeding demo data...")
            base_objs, claims, audit_entries = build_seed_objects()
            session.add_all(base_objs)
            session.add_all(claims)
            session.add_all(audit_entries)
            await session.commit()
            logger.info("Seeded %d claims and %d audit entries", len(claims), len(audit_entries))

    yield
    await engine.dispose()


app = FastAPI(title="ClaimShield Dev Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_tenant_id(request: Request) -> str:
    return request.headers.get("X-Tenant-Id", DEV_TENANT_ID)


def _get_user_id(request: Request) -> str:
    return request.headers.get("X-User-Id", DEV_USER_ID)


# ---------------------------------------------------------------------------
# Claims endpoints
# ---------------------------------------------------------------------------

class ClaimCreate(BaseModel):
    clinic_id: str | None = None
    patient_id: str | None = None
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


class StatusTransition(BaseModel):
    status: str
    reviewed_by: str | None = None


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


@app.get("/health")
async def health():
    return {"status": "ok", "mode": "standalone-sqlite"}


@app.post("/api/v1/claims", status_code=201)
async def create_claim(body: ClaimCreate, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        claim = Claim(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            clinic_id=body.clinic_id or DEV_CLINIC_ID,
            patient_id=body.patient_id,
            claim_number=body.claim_number,
            payer_name=body.payer_name,
            denial_code=body.denial_code,
            denial_reason=body.denial_reason,
            raw_denial_text=body.raw_denial_text,
            raw_clinical_notes=body.raw_clinical_notes,
            amount_denied_cents=body.amount_denied_cents,
        )
        session.add(claim)
        await _write_audit(session, tenant_id, _get_user_id(request), "claim.created", "claim", claim.id)
        await session.commit()
        await session.refresh(claim)
        return _claim_dict(claim)


@app.get("/api/v1/claims")
async def list_claims(
    request: Request,
    status: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id).order_by(Claim.created_at.desc()).limit(limit).offset(offset)
        if status:
            q = q.where(Claim.status == status)
        result = await session.execute(q)
        return [_claim_dict(c) for c in result.scalars().all()]


@app.get("/api/v1/claims/{claim_id}")
async def get_claim(claim_id: str, request: Request):
    async with app.state.session_factory() as session:
        claim = await session.get(Claim, claim_id)
        if not claim:
            return {"detail": f"Claim {claim_id} not found"}, 404
        return _claim_dict(claim)


@app.patch("/api/v1/claims/{claim_id}")
async def update_claim(claim_id: str, body: ClaimUpdate, request: Request):
    async with app.state.session_factory() as session:
        claim = await session.get(Claim, claim_id)
        if not claim:
            return {"detail": "Not found"}, 404
        updates = body.model_dump(exclude_unset=True)
        for k, v in updates.items():
            setattr(claim, k, v)
        claim.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(claim)
        return _claim_dict(claim)


@app.patch("/api/v1/claims/{claim_id}/status")
async def transition_status(claim_id: str, body: StatusTransition, request: Request):
    async with app.state.session_factory() as session:
        claim = await session.get(Claim, claim_id)
        if not claim:
            return {"detail": "Not found"}, 404
        allowed = ALLOWED_TRANSITIONS.get(claim.status, set())
        if body.status not in allowed:
            return {"detail": f"Cannot transition from '{claim.status}' to '{body.status}'"}, 409
        old_status = claim.status
        claim.status = body.status
        claim.updated_at = datetime.now(timezone.utc)
        if body.reviewed_by:
            claim.reviewed_by = body.reviewed_by
            claim.reviewed_at = datetime.now(timezone.utc)
        await _write_audit(
            session, claim.tenant_id, _get_user_id(request),
            "claim.status_changed", "claim", claim_id,
            {"old_status": old_status, "new_status": body.status},
        )
        await session.commit()
        await session.refresh(claim)
        return _claim_dict(claim)


def _claim_dict(c: Claim) -> dict:
    return {
        "id": c.id,
        "tenant_id": c.tenant_id,
        "clinic_id": c.clinic_id,
        "patient_id": c.patient_id,
        "claim_number": c.claim_number,
        "payer_name": c.payer_name,
        "denial_code": c.denial_code,
        "denial_reason": c.denial_reason,
        "raw_denial_text": c.raw_denial_text,
        "raw_clinical_notes": c.raw_clinical_notes,
        "amount_denied_cents": c.amount_denied_cents,
        "amount_approved_cents": c.amount_approved_cents,
        "status": c.status,
        "reviewed_by": c.reviewed_by,
        "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Appeals endpoints
# ---------------------------------------------------------------------------

class AppealCreate(BaseModel):
    claim_id: str
    letter_text: str | None = None
    policy_evidence: str | None = None
    confidence: float | None = None


class AppealApprove(BaseModel):
    approved_by: str


@app.post("/api/v1/appeals", status_code=201)
async def create_appeal(body: AppealCreate, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        result = await session.execute(
            select(func.coalesce(func.max(Appeal.version), 0))
            .where(Appeal.claim_id == body.claim_id)
        )
        next_version = result.scalar_one() + 1
        appeal = Appeal(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=body.claim_id,
            version=next_version,
            letter_text=body.letter_text,
            policy_evidence=body.policy_evidence,
            confidence=body.confidence,
            needs_review=True,
        )
        session.add(appeal)
        await _write_audit(session, tenant_id, _get_user_id(request), "appeal.drafted", "appeal", appeal.id)
        await session.commit()
        await session.refresh(appeal)
        return _appeal_dict(appeal)


@app.get("/api/v1/appeals")
async def list_appeals(
    request: Request,
    claim_id: str | None = None,
    needs_review: bool | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(Appeal).where(Appeal.tenant_id == tenant_id).order_by(Appeal.created_at.desc()).limit(limit).offset(offset)
        if claim_id:
            q = q.where(Appeal.claim_id == claim_id)
        if needs_review is not None:
            q = q.where(Appeal.needs_review == needs_review)
        result = await session.execute(q)
        return [_appeal_dict(a) for a in result.scalars().all()]


@app.get("/api/v1/appeals/{appeal_id}")
async def get_appeal(appeal_id: str, request: Request):
    async with app.state.session_factory() as session:
        appeal = await session.get(Appeal, appeal_id)
        if not appeal:
            return {"detail": "Not found"}, 404
        return _appeal_dict(appeal)


@app.patch("/api/v1/appeals/{appeal_id}/approve")
async def approve_appeal(appeal_id: str, body: AppealApprove, request: Request):
    async with app.state.session_factory() as session:
        appeal = await session.get(Appeal, appeal_id)
        if not appeal:
            return {"detail": "Not found"}, 404
        if not appeal.needs_review:
            return {"detail": "Already approved"}, 409
        appeal.needs_review = False
        appeal.approved_by = body.approved_by
        appeal.approved_at = datetime.now(timezone.utc)
        await _write_audit(
            session, appeal.tenant_id, _get_user_id(request),
            "appeal.approved", "appeal", appeal_id,
            {"approved_by": body.approved_by, "version": appeal.version},
        )
        await session.commit()
        await session.refresh(appeal)
        return _appeal_dict(appeal)


@app.patch("/api/v1/appeals/{appeal_id}/send")
async def send_appeal(appeal_id: str, request: Request):
    async with app.state.session_factory() as session:
        appeal = await session.get(Appeal, appeal_id)
        if not appeal:
            return {"detail": "Not found"}, 404
        if appeal.needs_review:
            return {"detail": "Appeal must be approved before sending. Nothing is sent without server-enforced human approval."}, 409
        await _write_audit(
            session, appeal.tenant_id, _get_user_id(request),
            "appeal.sent", "appeal", appeal_id,
        )
        await session.commit()
        await session.refresh(appeal)
        return _appeal_dict(appeal)


def _appeal_dict(a: Appeal) -> dict:
    return {
        "id": a.id,
        "tenant_id": a.tenant_id,
        "claim_id": a.claim_id,
        "version": a.version,
        "letter_text": a.letter_text,
        "policy_evidence": a.policy_evidence,
        "confidence": a.confidence,
        "needs_review": a.needs_review,
        "approved_by": a.approved_by,
        "approved_at": a.approved_at.isoformat() if a.approved_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


# ---------------------------------------------------------------------------
# Audit endpoints
# ---------------------------------------------------------------------------

@app.get("/api/v1/audit/entries")
async def list_audit_entries(
    request: Request,
    resource_type: str | None = None,
    resource_id: str | None = None,
    limit: int = 50,
):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(AuditLog).where(AuditLog.tenant_id == tenant_id).order_by(AuditLog.id.desc()).limit(limit)
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
            "detail": json.loads(r.detail) if r.detail else None,
            "prev_hash": r.prev_hash,
            "entry_hash": r.hash,
            "hash": r.hash,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@app.get("/api/v1/audit/verify")
async def verify_chain(request: Request, limit: int = 100):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        result = await session.execute(
            select(AuditLog)
            .where(AuditLog.tenant_id == tenant_id)
            .order_by(AuditLog.id.asc())
            .limit(limit)
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
        "valid": broken_at is None,
        "broken_at_id": broken_at,
        "first_broken_id": broken_at,
    }


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------

async def _write_audit(
    session: AsyncSession,
    tenant_id: str,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    detail: dict | None = None,
) -> None:
    result = await session.execute(
        select(AuditLog.hash)
        .where(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.id.desc())
        .limit(1)
    )
    prev_hash = result.scalar_one_or_none()

    ts = datetime.now(timezone.utc).isoformat()
    payload = json.dumps(
        {
            "prev_hash": prev_hash or "",
            "tenant_id": tenant_id,
            "actor_id": actor_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "detail": detail or {},
            "timestamp": ts,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    entry_hash = hashlib.sha256(payload.encode()).hexdigest()

    entry = AuditLog(
        tenant_id=tenant_id,
        actor_id=actor_id,
        actor_role="biller",
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=json.dumps(detail) if detail else None,
        prev_hash=prev_hash,
        hash=entry_hash,
    )
    session.add(entry)
