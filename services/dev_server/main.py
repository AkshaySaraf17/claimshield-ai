"""Standalone dev server — claims + appeals + audit on SQLite.

Run:  PYTHONPATH="$PWD" .venv/bin/uvicorn services.dev_server.main:app --port 8003 --reload
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base, Tenant, Clinic, Claim, Appeal, ClaimNote, AuditLog
from .seed import DEV_TENANT_ID, DEV_CLINIC_ID, DEV_USER_ID, build_seed_objects

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from services.claims.app.edi835 import parse_835, era_to_denial_summaries

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


PAYER_FILING_DAYS: dict[str, int] = {
    "aetna": 90,
    "unitedhealthcare": 90,
    "bcbs": 120,
    "blue cross blue shield": 120,
    "blue cross blueshield": 120,
    "cigna": 90,
    "humana": 365,
    "medicare": 120,
    "medicaid": 365,
}
DEFAULT_FILING_DAYS = 90


def _compute_deadline(payer_name: str | None) -> datetime:
    days = DEFAULT_FILING_DAYS
    if payer_name:
        normalized = payer_name.lower().strip()
        for key, d in PAYER_FILING_DAYS.items():
            if key in normalized:
                days = d
                break
    return datetime.now(timezone.utc) + timedelta(days=days)


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
            filing_deadline=_compute_deadline(body.payer_name),
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
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id).order_by(Claim.created_at.desc()).limit(limit).offset(offset)
        if status:
            q = q.where(Claim.status == status)
        if search:
            pattern = f"%{search}%"
            from sqlalchemy import or_
            q = q.where(or_(
                Claim.payer_name.ilike(pattern),
                Claim.denial_code.ilike(pattern),
                Claim.denial_reason.ilike(pattern),
                Claim.claim_number.ilike(pattern),
            ))
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
        "filing_deadline": c.filing_deadline.isoformat() if c.filing_deadline else None,
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


# ---------------------------------------------------------------------------
# Stats / analytics endpoint
# ---------------------------------------------------------------------------

@app.get("/api/v1/stats")
async def get_stats(request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        # Counts by status
        status_q = (
            select(Claim.status, func.count())
            .where(Claim.tenant_id == tenant_id)
            .group_by(Claim.status)
        )
        status_rows = (await session.execute(status_q)).all()
        by_status = {row[0]: row[1] for row in status_rows}
        total = sum(by_status.values())

        # Total denied amount
        denied_q = (
            select(func.coalesce(func.sum(Claim.amount_denied_cents), 0))
            .where(Claim.tenant_id == tenant_id)
        )
        total_denied_cents = (await session.execute(denied_q)).scalar_one()

        # Won amount
        won_q = (
            select(func.coalesce(func.sum(Claim.amount_denied_cents), 0))
            .where(Claim.tenant_id == tenant_id, Claim.status == "won")
        )
        won_cents = (await session.execute(won_q)).scalar_one()

        # Appeals counts
        appeals_total_q = (
            select(func.count())
            .select_from(Appeal)
            .where(Appeal.tenant_id == tenant_id)
        )
        appeals_total = (await session.execute(appeals_total_q)).scalar_one()

        pending_review_q = (
            select(func.count())
            .select_from(Appeal)
            .where(Appeal.tenant_id == tenant_id, Appeal.needs_review == True)
        )
        pending_review = (await session.execute(pending_review_q)).scalar_one()

        # Recent audit activity
        recent_q = (
            select(AuditLog)
            .where(AuditLog.tenant_id == tenant_id)
            .order_by(AuditLog.id.desc())
            .limit(10)
        )
        recent_rows = (await session.execute(recent_q)).scalars().all()
        recent_activity = [
            {
                "id": r.id,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "actor_id": r.actor_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in recent_rows
        ]

        # Payer breakdown
        payer_q = (
            select(Claim.payer_name, func.count(), func.coalesce(func.sum(Claim.amount_denied_cents), 0))
            .where(Claim.tenant_id == tenant_id, Claim.payer_name.isnot(None))
            .group_by(Claim.payer_name)
        )
        payer_rows = (await session.execute(payer_q)).all()
        by_payer = [
            {"payer": row[0], "count": row[1], "total_denied_cents": row[2]}
            for row in payer_rows
        ]

    won_count = by_status.get("won", 0)
    lost_count = by_status.get("lost", 0)
    decided = won_count + lost_count

    return {
        "claims_total": total,
        "claims_by_status": by_status,
        "total_denied_cents": total_denied_cents,
        "total_recovered_cents": won_cents,
        "win_rate": round(won_count / decided, 2) if decided > 0 else None,
        "appeals_total": appeals_total,
        "appeals_pending_review": pending_review,
        "by_payer": by_payer,
        "recent_activity": recent_activity,
    }


# ---------------------------------------------------------------------------
# EDI 835 parse and bulk import
# ---------------------------------------------------------------------------

@app.get("/api/v1/deadlines")
async def list_deadlines(request: Request, limit: int = Query(default=50, le=200)):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = (
            select(Claim)
            .where(
                Claim.tenant_id == tenant_id,
                Claim.filing_deadline.isnot(None),
                Claim.status.notin_(["won", "lost", "cancelled"]),
            )
            .order_by(Claim.filing_deadline.asc())
            .limit(limit)
        )
        result = await session.execute(q)
        now = datetime.utcnow()
        claims = []
        for c in result.scalars().all():
            d = _claim_dict(c)
            if c.filing_deadline:
                dl = c.filing_deadline.replace(tzinfo=None) if c.filing_deadline.tzinfo else c.filing_deadline
                delta = dl - now
                d["days_remaining"] = max(delta.days, 0)
                d["is_overdue"] = delta.days < 0
                d["urgency"] = (
                    "overdue" if delta.days < 0
                    else "critical" if delta.days <= 7
                    else "urgent" if delta.days <= 30
                    else "normal"
                )
            claims.append(d)
        return claims


class EDI835Upload(BaseModel):
    raw_edi: str


@app.post("/api/v1/edi835/parse")
async def parse_edi835(body: EDI835Upload):
    era = parse_835(body.raw_edi)
    summaries = era_to_denial_summaries(era)
    return {
        "payer_name": era.payer_name,
        "payee_name": era.payee_name,
        "check_number": era.check_number,
        "check_date": era.check_date.isoformat() if era.check_date else None,
        "total_paid_cents": era.total_paid_cents,
        "segment_count": era.raw_segment_count,
        "claims_found": len(summaries),
        "claims": summaries,
        "errors": era.errors,
    }


@app.post("/api/v1/edi835/import", status_code=201)
async def import_edi835(body: EDI835Upload, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    era = parse_835(body.raw_edi)
    summaries = era_to_denial_summaries(era)

    created_ids = []
    async with app.state.session_factory() as session:
        for s in summaries:
            denial_code = s.get("denial_code")
            svc_lines = s.get("service_lines", [])
            reason_parts = []
            for svc in svc_lines:
                for adj in svc.get("adjustments", []):
                    reason_parts.append(f"{adj['group']}-{adj['reason']}: ${adj['amount_cents'] / 100:.2f}")
            denial_reason = "; ".join(reason_parts) if reason_parts else None

            raw_text = (
                f"EDI 835 Remittance — Payer: {s.get('payer_name', 'Unknown')}, "
                f"Claim ID: {s.get('claim_id', 'N/A')}, "
                f"Denial code: {denial_code or 'N/A'}, "
                f"Charged: ${s.get('total_charge_cents', 0) / 100:.2f}, "
                f"Paid: ${s.get('total_paid_cents', 0) / 100:.2f}, "
                f"Denied: ${s.get('amount_denied_cents', 0) / 100:.2f}"
            )

            claim = Claim(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                clinic_id=DEV_CLINIC_ID,
                claim_number=s.get("claim_id"),
                payer_name=s.get("payer_name"),
                denial_code=denial_code,
                denial_reason=denial_reason,
                raw_denial_text=raw_text,
                raw_clinical_notes="Imported from EDI 835 remittance advice",
                amount_denied_cents=s.get("amount_denied_cents", 0),
                filing_deadline=_compute_deadline(s.get("payer_name")),
            )
            session.add(claim)
            await _write_audit(session, tenant_id, user_id, "claim.created", "claim", claim.id, {"source": "edi835"})
            created_ids.append(claim.id)

        await session.commit()

    return {
        "imported": len(created_ids),
        "claim_ids": created_ids,
        "payer_name": era.payer_name,
    }


# ── Payer Analytics ──────────────────────────────────────────────────────

@app.get("/api/v1/analytics/payers")
async def payer_analytics(request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id)
        result = await session.execute(q)
        claims = result.scalars().all()

    payers: dict[str, dict] = {}
    for c in claims:
        name = c.payer_name or "Unknown"
        if name not in payers:
            payers[name] = {
                "payer_name": name,
                "total_claims": 0,
                "total_denied_cents": 0,
                "total_recovered_cents": 0,
                "denial_codes": {},
                "by_status": {},
            }
        p = payers[name]
        p["total_claims"] += 1
        p["total_denied_cents"] += c.amount_denied_cents or 0
        if c.status == "won":
            p["total_recovered_cents"] += c.amount_denied_cents or 0

        code = c.denial_code or "unknown"
        p["denial_codes"][code] = p["denial_codes"].get(code, 0) + 1
        p["by_status"][c.status] = p["by_status"].get(c.status, 0) + 1

    result_list = sorted(payers.values(), key=lambda x: x["total_denied_cents"], reverse=True)
    for p in result_list:
        denied = p["total_denied_cents"]
        recovered = p["total_recovered_cents"]
        p["win_rate"] = round(recovered / denied * 100, 1) if denied > 0 else 0.0

    return result_list


# ── CSV Export ───────────────────────────────────────────────────────────

@app.get("/api/v1/claims/export")
async def export_claims_csv(request: Request):
    from starlette.responses import Response

    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = (
            select(Claim)
            .where(Claim.tenant_id == tenant_id)
            .order_by(Claim.created_at.desc())
        )
        result = await session.execute(q)
        claims = result.scalars().all()

    headers = [
        "claim_number", "payer_name", "denial_code", "denial_reason",
        "amount_denied", "status", "filing_deadline", "created_at",
    ]
    rows = [",".join(headers)]
    for c in claims:
        denied = f"{(c.amount_denied_cents or 0) / 100:.2f}"
        deadline = c.filing_deadline.strftime("%Y-%m-%d") if c.filing_deadline else ""
        created = c.created_at.strftime("%Y-%m-%d %H:%M") if c.created_at else ""
        row = [
            c.claim_number or "",
            f'"{c.payer_name}"' if c.payer_name else "",
            c.denial_code or "",
            f'"{(c.denial_reason or "").replace(chr(34), chr(39))}"',
            denied,
            c.status,
            deadline,
            created,
        ]
        rows.append(",".join(row))

    csv_content = "\n".join(rows)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=claims_export.csv"},
    )


# ── Batch Status Transition ─────────────────────────────────────────────

class BatchTransition(BaseModel):
    claim_ids: list[str]
    new_status: str


@app.post("/api/v1/claims/batch-transition")
async def batch_transition(body: BatchTransition, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)

    results = []
    async with app.state.session_factory() as session:
        for claim_id in body.claim_ids:
            q = select(Claim).where(Claim.id == claim_id, Claim.tenant_id == tenant_id)
            result = await session.execute(q)
            claim = result.scalar_one_or_none()
            if not claim:
                results.append({"id": claim_id, "success": False, "error": "not found"})
                continue

            allowed = ALLOWED_TRANSITIONS.get(claim.status, set())
            if body.new_status not in allowed:
                results.append({
                    "id": claim_id,
                    "success": False,
                    "error": f"cannot transition from {claim.status} to {body.new_status}",
                })
                continue

            claim.status = body.new_status
            claim.updated_at = datetime.now(timezone.utc)
            if body.new_status in ("approved", "needs_review"):
                claim.reviewed_by = user_id
                claim.reviewed_at = datetime.now(timezone.utc)

            await _write_audit(
                session, tenant_id, user_id,
                f"claim.status.{body.new_status}", "claim", claim_id,
                {"new_status": body.new_status},
            )
            results.append({"id": claim_id, "success": True, "new_status": body.new_status})

        await session.commit()

    return {"results": results}


# ── Denial Codes Reference ──────────────────────────────────────────────

DENIAL_CODES = [
    {"code": "CO-4", "group": "CO", "reason": "4", "description": "The procedure code is inconsistent with the modifier used or a required modifier is missing.", "category": "Coding", "source": "CMS CARC List"},
    {"code": "CO-16", "group": "CO", "reason": "16", "description": "Claim/service lacks information or has submission/billing error(s).", "category": "Information", "source": "CMS CARC List"},
    {"code": "CO-18", "group": "CO", "reason": "18", "description": "Exact duplicate claim/service.", "category": "Duplicate", "source": "CMS CARC List"},
    {"code": "CO-29", "group": "CO", "reason": "29", "description": "The time limit for filing has expired.", "category": "Timely Filing", "source": "CMS CARC List"},
    {"code": "CO-45", "group": "CO", "reason": "45", "description": "Charge exceeds fee schedule/maximum allowable or contracted/legislated fee arrangement.", "category": "Fee Schedule", "source": "CMS CARC List"},
    {"code": "CO-50", "group": "CO", "reason": "50", "description": "These are non-covered services because this is not deemed a 'medical necessity' by the payer.", "category": "Medical Necessity", "source": "CMS CARC List"},
    {"code": "CO-97", "group": "CO", "reason": "97", "description": "The benefit for this service is included in the payment/allowance for another service/procedure that has already been adjudicated.", "category": "Bundling", "source": "CMS CARC List"},
    {"code": "CO-109", "group": "CO", "reason": "109", "description": "Claim/service not covered by this payer/contractor. You must send the claim/service to the correct payer/contractor.", "category": "Coverage", "source": "CMS CARC List"},
    {"code": "CO-197", "group": "CO", "reason": "197", "description": "Precertification/authorization/notification/pre-treatment absent.", "category": "Authorization", "source": "CMS CARC List"},
    {"code": "CO-204", "group": "CO", "reason": "204", "description": "This service/equipment/drug is not covered under the patient's current benefit plan.", "category": "Coverage", "source": "CMS CARC List"},
    {"code": "CO-236", "group": "CO", "reason": "236", "description": "This procedure or procedure/modifier combination is not compatible with another procedure or procedure/modifier combination provided on the same day.", "category": "Coding", "source": "CMS CARC List"},
    {"code": "PR-1", "group": "PR", "reason": "1", "description": "Deductible amount.", "category": "Patient Responsibility", "source": "CMS CARC List"},
    {"code": "PR-2", "group": "PR", "reason": "2", "description": "Coinsurance amount.", "category": "Patient Responsibility", "source": "CMS CARC List"},
    {"code": "PR-3", "group": "PR", "reason": "3", "description": "Co-payment amount.", "category": "Patient Responsibility", "source": "CMS CARC List"},
    {"code": "PR-96", "group": "PR", "reason": "96", "description": "Non-covered charge(s). At least one Remark Code must be provided.", "category": "Coverage", "source": "CMS CARC List"},
    {"code": "OA-23", "group": "OA", "reason": "23", "description": "The impact of prior payer(s) adjudication including payments and/or adjustments.", "category": "Coordination of Benefits", "source": "CMS CARC List"},
]


@app.get("/api/v1/denial-codes")
async def list_denial_codes(search: str = Query("", max_length=100)):
    if not search:
        return DENIAL_CODES
    q = search.lower()
    return [
        c for c in DENIAL_CODES
        if q in c["code"].lower()
        or q in c["description"].lower()
        or q in c["category"].lower()
    ]


# ── Claim Notes ─────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    content: str


@app.get("/api/v1/claims/{claim_id}/notes")
async def list_notes(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = (
            select(ClaimNote)
            .where(ClaimNote.claim_id == claim_id, ClaimNote.tenant_id == tenant_id)
            .order_by(ClaimNote.created_at.desc())
        )
        result = await session.execute(q)
        notes = result.scalars().all()
        return [
            {
                "id": n.id,
                "claim_id": n.claim_id,
                "author_id": n.author_id,
                "content": n.content,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notes
        ]


@app.post("/api/v1/claims/{claim_id}/notes", status_code=201)
async def create_note(claim_id: str, body: NoteCreate, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with app.state.session_factory() as session:
        note = ClaimNote(
            tenant_id=tenant_id,
            claim_id=claim_id,
            author_id=user_id,
            content=body.content,
        )
        session.add(note)
        await _write_audit(session, tenant_id, user_id, "note.created", "claim", claim_id, {"note_id": note.id})
        await session.commit()
        return {
            "id": note.id,
            "claim_id": note.claim_id,
            "author_id": note.author_id,
            "content": note.content,
            "created_at": note.created_at.isoformat() if note.created_at else None,
        }
