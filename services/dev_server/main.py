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
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base, Tenant, Clinic, Claim, Appeal, ClaimNote, ClaimAttachment, UserPreference, AuditLog, CustomTemplate, ClaimAssignment
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


@app.get("/api/v1/rules/config")
async def rules_config():
    transitions = {
        status: sorted(targets) for status, targets in ALLOWED_TRANSITIONS.items()
    }
    code_mappings = [
        {"denial_code": code, "category": cat}
        for code, cat in sorted(DENIAL_CODE_TO_CATEGORY.items())
    ]
    pipeline_stages = [
        {"name": s, "label": s.replace("_", " ").title()}
        for s in PIPELINE_STAGES
    ]
    return {
        "transitions": transitions,
        "denial_code_mappings": code_mappings,
        "pipeline_stages": pipeline_stages,
        "appeal_template_categories": sorted(APPEAL_TEMPLATES.keys()),
    }


@app.get("/api/v1/workqueue")
async def workqueue(request: Request):
    tenant_id = _get_tenant_id(request)
    now = datetime.utcnow()

    async with app.state.session_factory() as session:
        q = select(Claim).where(
            Claim.tenant_id == tenant_id,
            Claim.status.in_(["pending_review", "in_progress", "needs_review"]),
        ).order_by(Claim.created_at.asc())
        result = await session.execute(q)
        claims = result.scalars().all()

        aq = select(Appeal).where(
            Appeal.tenant_id == tenant_id,
            Appeal.needs_review == True,
        )
        ar = await session.execute(aq)
        pending_appeals = {a.claim_id: a.id for a in ar.scalars().all()}

    items = []
    for c in claims:
        urgency = 0
        reasons = []

        if c.filing_deadline:
            days_left = (c.filing_deadline - now).days
            if days_left <= 3:
                urgency += 100
                reasons.append(f"deadline in {days_left}d")
            elif days_left <= 7:
                urgency += 50
                reasons.append(f"deadline in {days_left}d")

        age_days = (now - c.created_at).days if c.created_at else 0
        if age_days >= 14:
            urgency += 30
            reasons.append(f"{age_days}d old")
        elif age_days >= 7:
            urgency += 15
            reasons.append(f"{age_days}d old")

        if c.status == "needs_review":
            urgency += 20
            reasons.append("needs review")

        if c.id in pending_appeals:
            urgency += 10
            reasons.append("appeal pending")

        if c.amount_denied_cents and c.amount_denied_cents >= 1000000:
            urgency += 25
            reasons.append("high value")

        items.append({
            **_claim_dict(c),
            "urgency_score": urgency,
            "urgency_reasons": reasons,
            "has_pending_appeal": c.id in pending_appeals,
            "age_days": age_days,
            "allowed_transitions": sorted(ALLOWED_TRANSITIONS.get(c.status, set())),
        })

    items.sort(key=lambda x: x["urgency_score"], reverse=True)
    return {"items": items, "total": len(items)}


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


@app.get("/api/v1/claims/search")
async def search_claims(
    request: Request,
    q: str | None = None,
    status: str | None = None,
    payer: str | None = None,
    denial_code: str | None = None,
    min_amount_cents: int | None = None,
    max_amount_cents: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    assigned_to: str | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    from sqlalchemy import or_
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        query = select(Claim).where(Claim.tenant_id == tenant_id)

        if q:
            pattern = f"%{q}%"
            query = query.where(or_(
                Claim.payer_name.ilike(pattern),
                Claim.denial_code.ilike(pattern),
                Claim.denial_reason.ilike(pattern),
                Claim.claim_number.ilike(pattern),
                Claim.patient_id.ilike(pattern),
            ))
        if status:
            statuses = [s.strip() for s in status.split(",")]
            if len(statuses) == 1:
                query = query.where(Claim.status == statuses[0])
            else:
                query = query.where(Claim.status.in_(statuses))
        if payer:
            query = query.where(Claim.payer_name.ilike(f"%{payer}%"))
        if denial_code:
            query = query.where(Claim.denial_code == denial_code)
        if min_amount_cents is not None:
            query = query.where(Claim.amount_denied_cents >= min_amount_cents)
        if max_amount_cents is not None:
            query = query.where(Claim.amount_denied_cents <= max_amount_cents)
        if date_from:
            query = query.where(Claim.created_at >= datetime.fromisoformat(date_from))
        if date_to:
            query = query.where(Claim.created_at <= datetime.fromisoformat(date_to))

        if assigned_to:
            assigned_q = select(ClaimAssignment.claim_id).where(
                ClaimAssignment.tenant_id == tenant_id,
                ClaimAssignment.assigned_to == assigned_to,
            )
            assigned_result = await session.execute(assigned_q)
            assigned_ids = [r[0] for r in assigned_result.all()]
            if assigned_ids:
                query = query.where(Claim.id.in_(assigned_ids))
            else:
                return {"claims": [], "total": 0}

        sort_col = getattr(Claim, sort_by, Claim.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_col.asc())
        else:
            query = query.order_by(sort_col.desc())

        count_q = select(func.count()).select_from(query.subquery())
        count_result = await session.execute(count_q)
        total = count_result.scalar() or 0

        query = query.limit(limit).offset(offset)
        result = await session.execute(query)
        claims = [_claim_dict(c) for c in result.scalars().all()]

        return {"claims": claims, "total": total}


@app.get("/api/v1/claims/duplicates")
async def detect_duplicates(request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id).order_by(Claim.created_at.desc())
        result = await session.execute(q)
        claims = result.scalars().all()

    groups: dict[str, list[dict]] = {}
    for c in claims:
        key = f"{(c.payer_name or '').lower().strip()}|{(c.denial_code or '').strip()}|{c.amount_denied_cents or 0}"
        if key not in groups:
            groups[key] = []
        groups[key].append(_claim_dict(c))

    duplicates = []
    for key, group_claims in groups.items():
        if len(group_claims) < 2:
            continue
        payer, code, amount = key.split("|")
        duplicates.append({
            "payer_name": payer,
            "denial_code": code,
            "amount_denied_cents": int(amount),
            "count": len(group_claims),
            "claims": group_claims,
        })

    duplicates.sort(key=lambda d: d["count"], reverse=True)
    return {"groups": duplicates, "total_groups": len(duplicates)}


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

        appeal_result = await session.execute(
            select(Appeal).where(Appeal.tenant_id == tenant_id)
        )
        appeals = appeal_result.scalars().all()

    appeal_by_claim: dict[str, list] = {}
    for a in appeals:
        appeal_by_claim.setdefault(a.claim_id, []).append(a)

    payers: dict[str, dict] = {}
    for c in claims:
        name = c.payer_name or "Unknown"
        if name not in payers:
            payers[name] = {
                "payer": name,
                "total_claims": 0,
                "total_denied_cents": 0,
                "total_recovered_cents": 0,
                "avg_amount_cents": 0,
                "appeals_count": 0,
                "won": 0,
                "lost": 0,
                "pending": 0,
                "win_rate": 0,
                "recovery_rate": 0,
                "by_status": {},
                "by_denial_code": {},
            }
        p = payers[name]
        p["total_claims"] += 1
        p["total_denied_cents"] += c.amount_denied_cents or 0
        p["by_status"][c.status] = p["by_status"].get(c.status, 0) + 1

        code = c.denial_code or "Unknown"
        p["by_denial_code"][code] = p["by_denial_code"].get(code, 0) + 1

        if c.status == "won":
            p["won"] += 1
            p["total_recovered_cents"] += c.amount_denied_cents or 0
        elif c.status == "lost":
            p["lost"] += 1
        elif c.status in ("pending_review", "in_progress", "needs_review", "approved", "sent"):
            p["pending"] += 1

        p["appeals_count"] += len(appeal_by_claim.get(c.id, []))

    payer_list = []
    for p in payers.values():
        if p["total_claims"] > 0:
            p["avg_amount_cents"] = p["total_denied_cents"] // p["total_claims"]
        decided = p["won"] + p["lost"]
        p["win_rate"] = round(p["won"] / decided * 100) if decided > 0 else 0
        p["recovery_rate"] = round(p["total_recovered_cents"] / p["total_denied_cents"] * 100) if p["total_denied_cents"] > 0 else 0
        p["by_denial_code"] = [{"code": k, "count": v} for k, v in sorted(p["by_denial_code"].items(), key=lambda x: -x[1])]
        payer_list.append(p)

    payer_list.sort(key=lambda x: -x["total_denied_cents"])

    return {
        "payers": payer_list,
        "total_payers": len(payer_list),
        "total_claims": len(claims),
        "total_denied_cents": sum(c.amount_denied_cents or 0 for c in claims),
    }


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


class AttachmentCreate(BaseModel):
    filename: str
    file_type: str
    size_bytes: int = 0
    description: str | None = None


class PreferenceUpdate(BaseModel):
    value: str


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


# ── Appeal Letter Template Generator (deterministic, no LLM) ──────────

APPEAL_TEMPLATES: dict[str, dict] = {
    "Medical Necessity": {
        "category": "Medical Necessity",
        "sections": [
            "patient_info",
            "denial_summary",
            "medical_necessity_argument",
            "clinical_evidence",
            "regulatory_citations",
            "closing",
        ],
        "source": "CMS Medicare Claims Processing Manual Ch. 1 §60",
    },
    "Timely Filing": {
        "category": "Timely Filing",
        "sections": [
            "patient_info",
            "denial_summary",
            "timely_filing_argument",
            "proof_of_timely_submission",
            "closing",
        ],
        "source": "42 CFR §405.980(b)(2)",
    },
    "Authorization": {
        "category": "Authorization",
        "sections": [
            "patient_info",
            "denial_summary",
            "authorization_argument",
            "auth_reference_numbers",
            "closing",
        ],
        "source": "ERISA §503; 29 CFR §2560.503-1",
    },
    "Coding": {
        "category": "Coding",
        "sections": [
            "patient_info",
            "denial_summary",
            "coding_correction_argument",
            "supporting_documentation",
            "closing",
        ],
        "source": "AMA CPT Guidelines; CMS NCCI Policy Manual",
    },
    "Coverage": {
        "category": "Coverage",
        "sections": [
            "patient_info",
            "denial_summary",
            "coverage_argument",
            "plan_documentation",
            "closing",
        ],
        "source": "Patient's Summary of Benefits; State Insurance Code",
    },
    "Duplicate": {
        "category": "Duplicate",
        "sections": [
            "patient_info",
            "denial_summary",
            "duplicate_rebuttal",
            "service_differentiation",
            "closing",
        ],
        "source": "CMS IOM Pub. 100-04 Ch. 1 §80.3.2.2",
    },
}

DENIAL_CODE_TO_CATEGORY: dict[str, str] = {
    "CO-4": "Coding", "CO-16": "Information", "CO-18": "Duplicate",
    "CO-29": "Timely Filing", "CO-45": "Fee Schedule",
    "CO-50": "Medical Necessity", "CO-97": "Bundling",
    "CO-109": "Coverage", "CO-197": "Authorization",
    "CO-204": "Coverage", "CO-236": "Coding",
}


def _generate_appeal_letter(claim: dict, template_category: str) -> str:
    template = APPEAL_TEMPLATES.get(template_category)
    if not template:
        template = APPEAL_TEMPLATES["Medical Necessity"]
        template_category = "Medical Necessity"

    today = datetime.now(timezone.utc).strftime("%B %d, %Y")
    amount = f"${(claim.get('amount_denied_cents') or 0) / 100:,.2f}"

    lines = [
        f"Date: {today}",
        "",
        f"Re: Appeal of Denied Claim — {claim.get('claim_number', 'N/A')}",
        f"Patient ID: {claim.get('patient_id', 'N/A')}",
        f"Payer: {claim.get('payer_name', 'Unknown Payer')}",
        f"Denial Code: {claim.get('denial_code', 'N/A')}",
        f"Amount Denied: {amount}",
        "",
        "Dear Claims Review Department,",
        "",
        f"I am writing to formally appeal the denial of the above-referenced claim. "
        f"The claim was denied under code {claim.get('denial_code', 'N/A')} "
        f"({claim.get('denial_reason', 'reason not specified')}).",
        "",
    ]

    if template_category == "Medical Necessity":
        lines.extend([
            "MEDICAL NECESSITY ARGUMENT",
            "─" * 40,
            "The services rendered were medically necessary as documented in the "
            "patient's clinical records. The treating physician determined that "
            "the procedure/service was required to diagnose or treat the patient's "
            "condition based on accepted standards of medical practice.",
            "",
            "The clinical evidence supporting this determination includes:",
            f"  • Clinical notes: {claim.get('raw_clinical_notes', 'See attached')}",
            "",
            f"Source: {template['source']}",
        ])
    elif template_category == "Timely Filing":
        lines.extend([
            "TIMELY FILING ARGUMENT",
            "─" * 40,
            "This claim was submitted within the required timely filing period. "
            "Evidence of original submission date is attached. Per the applicable "
            "filing deadline requirements, this claim remains within the allowable "
            "window for consideration.",
            "",
            f"Filing deadline: {claim.get('filing_deadline', 'N/A')}",
            "",
            f"Source: {template['source']}",
        ])
    elif template_category == "Authorization":
        lines.extend([
            "PRIOR AUTHORIZATION ARGUMENT",
            "─" * 40,
            "Prior authorization was obtained for the services in question. "
            "The authorization reference information is documented in the "
            "patient's records. We request that this claim be reprocessed "
            "with the authorization information on file.",
            "",
            f"Source: {template['source']}",
        ])
    elif template_category == "Coding":
        lines.extend([
            "CODING CORRECTION ARGUMENT",
            "─" * 40,
            "Upon review, the procedure codes billed accurately reflect the "
            "services provided. The coding is consistent with the clinical "
            "documentation and follows current CPT/HCPCS guidelines. "
            "The modifier(s) used are appropriate for the services rendered.",
            "",
            f"Source: {template['source']}",
        ])
    elif template_category == "Coverage":
        lines.extend([
            "COVERAGE ARGUMENT",
            "─" * 40,
            "The denied services are covered under the patient's current "
            "benefit plan. The Summary of Benefits and Coverage confirms that "
            "the service category in question is an included benefit. We "
            "request reprocessing of this claim under the correct benefit category.",
            "",
            f"Source: {template['source']}",
        ])
    elif template_category == "Duplicate":
        lines.extend([
            "DUPLICATE CLAIM REBUTTAL",
            "─" * 40,
            "This claim is not a duplicate. The services billed represent "
            "distinct encounters or procedures that are separately billable. "
            "Supporting documentation differentiating these services from any "
            "previously adjudicated claims is attached.",
            "",
            f"Source: {template['source']}",
        ])

    lines.extend([
        "",
        "REQUESTED ACTION",
        "─" * 40,
        f"We respectfully request that this denial be overturned and the claim "
        f"be reprocessed for payment of {amount}.",
        "",
        "Supporting documentation is enclosed. Please do not hesitate to contact "
        "our office if additional information is required.",
        "",
        "Sincerely,",
        "[Provider Name]",
        "[Provider NPI]",
        "[Contact Information]",
        "",
        f"--- Template: {template_category} | Source: {template['source']} ---",
    ])

    return "\n".join(lines)


@app.get("/api/v1/appeal-templates")
async def list_appeal_templates():
    return [
        {"category": k, "sections": v["sections"], "source": v["source"]}
        for k, v in APPEAL_TEMPLATES.items()
    ]


class GenerateLetterRequest(BaseModel):
    claim_id: str
    template_category: str | None = None


@app.post("/api/v1/appeal-letters/generate")
async def generate_appeal_letter(body: GenerateLetterRequest, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        claim = await session.get(Claim, body.claim_id)
        if not claim or claim.tenant_id != tenant_id:
            return {"detail": "Claim not found"}, 404

        claim_data = _claim_dict(claim)

    category = body.template_category
    if not category:
        code = claim_data.get("denial_code", "")
        category = DENIAL_CODE_TO_CATEGORY.get(code, "Medical Necessity")

    letter = _generate_appeal_letter(claim_data, category)

    return {
        "claim_id": body.claim_id,
        "template_category": category,
        "letter_text": letter,
        "source": APPEAL_TEMPLATES.get(category, {}).get("source", "N/A"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Claim Timeline ────────────────────────────────────────────────────

@app.get("/api/v1/claims/{claim_id}/timeline")
async def claim_timeline(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        claim = await session.get(Claim, claim_id)
        if not claim or claim.tenant_id != tenant_id:
            return JSONResponse({"detail": "Claim not found"}, status_code=404)

        events: list[dict] = []

        events.append({
            "type": "claim_created",
            "timestamp": claim.created_at.isoformat(),
            "title": "Claim created",
            "detail": f"Claim {claim.claim_number or claim_id[:8]} created — {claim.payer_name}, {claim.denial_code}",
        })

        audit_q = select(AuditLog).where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.resource_id == claim_id,
        ).order_by(AuditLog.created_at)
        audit_result = await session.execute(audit_q)
        for log in audit_result.scalars().all():
            events.append({
                "type": "audit",
                "timestamp": log.created_at.isoformat(),
                "title": log.action.replace(".", " ").replace("_", " ").title(),
                "detail": f"By {log.actor_id}",
                "action": log.action,
            })

        appeals_q = select(Appeal).where(
            Appeal.tenant_id == tenant_id,
            Appeal.claim_id == claim_id,
        ).order_by(Appeal.created_at)
        appeals_result = await session.execute(appeals_q)
        for ap in appeals_result.scalars().all():
            events.append({
                "type": "appeal_created",
                "timestamp": ap.created_at.isoformat(),
                "title": f"Appeal draft v{ap.version}",
                "detail": f"Confidence: {ap.confidence:.0%}" if ap.confidence else "No confidence score",
                "appeal_id": ap.id,
            })
            if ap.approved_by:
                events.append({
                    "type": "appeal_approved",
                    "timestamp": (ap.approved_at or ap.created_at).isoformat(),
                    "title": "Appeal approved",
                    "detail": f"Approved by {ap.approved_by}",
                    "appeal_id": ap.id,
                })

        notes_q = select(ClaimNote).where(
            ClaimNote.tenant_id == tenant_id,
            ClaimNote.claim_id == claim_id,
        ).order_by(ClaimNote.created_at)
        notes_result = await session.execute(notes_q)
        for note in notes_result.scalars().all():
            events.append({
                "type": "note",
                "timestamp": note.created_at.isoformat(),
                "title": "Note added",
                "detail": note.body[:120] + ("..." if len(note.body) > 120 else ""),
                "author": note.author_id,
            })

        if claim.filing_deadline:
            events.append({
                "type": "deadline",
                "timestamp": claim.filing_deadline.isoformat(),
                "title": "Filing deadline",
                "detail": f"Deadline for {claim.payer_name}",
            })

    events.sort(key=lambda e: e["timestamp"])
    return events


class BatchAppealRequest(BaseModel):
    claim_ids: list[str]
    template_category: str | None = None
    save_as_draft: bool = False


@app.post("/api/v1/appeal-letters/batch")
async def batch_generate_appeals(body: BatchAppealRequest, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = request.headers.get("x-user-id", "system")

    results = []
    async with app.state.session_factory() as session:
        for cid in body.claim_ids[:20]:
            claim = await session.get(Claim, cid)
            if not claim or claim.tenant_id != tenant_id:
                results.append({"claim_id": cid, "error": "Claim not found"})
                continue

            claim_data = _claim_dict(claim)
            category = body.template_category
            if not category:
                code = claim_data.get("denial_code", "")
                category = DENIAL_CODE_TO_CATEGORY.get(code, "Medical Necessity")

            letter = _generate_appeal_letter(claim_data, category)

            entry: dict = {
                "claim_id": cid,
                "claim_number": claim_data.get("claim_number"),
                "template_category": category,
                "letter_text": letter,
                "source": APPEAL_TEMPLATES.get(category, {}).get("source", "N/A"),
            }

            if body.save_as_draft:
                appeal = Appeal(
                    tenant_id=tenant_id,
                    claim_id=cid,
                    letter_text=letter,
                    confidence=0.85,
                    needs_review=True,
                )
                session.add(appeal)
                _add_audit(session, tenant_id, "appeal.drafted", "appeal", appeal.id, user_id,
                           {"source": "batch", "category": category})
                entry["appeal_id"] = appeal.id

            results.append(entry)

        if body.save_as_draft:
            await session.commit()

    return {
        "generated": len([r for r in results if "error" not in r]),
        "errors": len([r for r in results if "error" in r]),
        "results": results,
    }


# ── Claim Attachments ──────────────────────────────────────────────────

@app.get("/api/v1/claims/{claim_id}/attachments")
async def list_attachments(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = (
            select(ClaimAttachment)
            .where(ClaimAttachment.claim_id == claim_id, ClaimAttachment.tenant_id == tenant_id)
            .order_by(ClaimAttachment.created_at.desc())
        )
        result = await session.execute(q)
        return [
            {
                "id": a.id,
                "claim_id": a.claim_id,
                "filename": a.filename,
                "file_type": a.file_type,
                "size_bytes": a.size_bytes,
                "uploaded_by": a.uploaded_by,
                "description": a.description,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in result.scalars().all()
        ]


@app.post("/api/v1/claims/{claim_id}/attachments", status_code=201)
async def create_attachment(claim_id: str, body: AttachmentCreate, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with app.state.session_factory() as session:
        att = ClaimAttachment(
            tenant_id=tenant_id,
            claim_id=claim_id,
            filename=body.filename,
            file_type=body.file_type,
            size_bytes=body.size_bytes,
            uploaded_by=user_id,
            description=body.description,
        )
        session.add(att)
        await _write_audit(session, tenant_id, user_id, "attachment.created", "claim", claim_id, {"filename": body.filename})
        await session.commit()
        return {
            "id": att.id,
            "claim_id": att.claim_id,
            "filename": att.filename,
            "file_type": att.file_type,
            "size_bytes": att.size_bytes,
            "uploaded_by": att.uploaded_by,
            "description": att.description,
            "created_at": att.created_at.isoformat() if att.created_at else None,
        }


@app.delete("/api/v1/claims/{claim_id}/attachments/{attachment_id}")
async def delete_attachment(claim_id: str, attachment_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with app.state.session_factory() as session:
        att = await session.get(ClaimAttachment, attachment_id)
        if not att or att.tenant_id != tenant_id:
            return {"detail": "Not found"}, 404
        await _write_audit(session, tenant_id, user_id, "attachment.deleted", "claim", claim_id, {"filename": att.filename})
        await session.delete(att)
        await session.commit()
        return {"deleted": True}


# ── User Preferences ──────────────────────────────────────────────────

DEFAULT_PREFERENCES = {
    "notification_email": "true",
    "notification_deadline_days": "7",
    "default_view": "claims",
    "items_per_page": "25",
    "theme": "light",
    "auto_assign_appeals": "false",
}


@app.get("/api/v1/preferences")
async def get_preferences(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with app.state.session_factory() as session:
        q = select(UserPreference).where(
            UserPreference.tenant_id == tenant_id,
            UserPreference.user_id == user_id,
        )
        result = await session.execute(q)
        prefs = {p.key: p.value for p in result.scalars().all()}

    merged = {**DEFAULT_PREFERENCES, **prefs}
    return merged


@app.put("/api/v1/preferences/{key}")
async def set_preference(key: str, body: PreferenceUpdate, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with app.state.session_factory() as session:
        q = select(UserPreference).where(
            UserPreference.tenant_id == tenant_id,
            UserPreference.user_id == user_id,
            UserPreference.key == key,
        )
        result = await session.execute(q)
        pref = result.scalar_one_or_none()
        if pref:
            pref.value = body.value
            pref.updated_at = datetime.now(timezone.utc)
        else:
            pref = UserPreference(
                tenant_id=tenant_id,
                user_id=user_id,
                key=key,
                value=body.value,
            )
            session.add(pref)
        await session.commit()
        return {"key": key, "value": body.value}


# ── Reporting / Summary ────────────────────────────────────────────────

@app.get("/api/v1/reports/summary")
async def report_summary(request: Request, period_days: int = Query(default=30, ge=1, le=365)):
    tenant_id = _get_tenant_id(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)

    async with app.state.session_factory() as session:
        # All claims
        all_q = select(Claim).where(Claim.tenant_id == tenant_id)
        all_result = await session.execute(all_q)
        all_claims = all_result.scalars().all()

        # Recent claims (in period)
        recent = [c for c in all_claims if c.created_at and c.created_at.replace(tzinfo=None) >= cutoff.replace(tzinfo=None)]

        # Appeals in period
        appeals_q = select(Appeal).where(Appeal.tenant_id == tenant_id)
        appeals_result = await session.execute(appeals_q)
        all_appeals = appeals_result.scalars().all()
        recent_appeals = [a for a in all_appeals if a.created_at and a.created_at.replace(tzinfo=None) >= cutoff.replace(tzinfo=None)]

        # Audit entries in period
        audit_q = select(func.count()).select_from(AuditLog).where(AuditLog.tenant_id == tenant_id)
        total_audit = (await session.execute(audit_q)).scalar_one()

    total_denied = sum(c.amount_denied_cents or 0 for c in all_claims)
    total_recovered = sum(c.amount_denied_cents or 0 for c in all_claims if c.status == "won")
    period_denied = sum(c.amount_denied_cents or 0 for c in recent)
    period_recovered = sum(c.amount_denied_cents or 0 for c in recent if c.status == "won")

    status_dist = {}
    for c in all_claims:
        status_dist[c.status] = status_dist.get(c.status, 0) + 1

    payer_summary = {}
    for c in all_claims:
        name = c.payer_name or "Unknown"
        if name not in payer_summary:
            payer_summary[name] = {"claims": 0, "denied_cents": 0, "won": 0}
        payer_summary[name]["claims"] += 1
        payer_summary[name]["denied_cents"] += c.amount_denied_cents or 0
        if c.status == "won":
            payer_summary[name]["won"] += 1

    denial_code_dist = {}
    for c in all_claims:
        code = c.denial_code or "unknown"
        denial_code_dist[code] = denial_code_dist.get(code, 0) + 1

    top_denial_codes = sorted(denial_code_dist.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "period_days": period_days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "claims": len(all_claims),
            "denied_cents": total_denied,
            "recovered_cents": total_recovered,
            "recovery_rate": round(total_recovered / total_denied * 100, 1) if total_denied > 0 else 0,
            "appeals": len(all_appeals),
            "audit_entries": total_audit,
        },
        "period": {
            "new_claims": len(recent),
            "denied_cents": period_denied,
            "recovered_cents": period_recovered,
            "new_appeals": len(recent_appeals),
        },
        "status_distribution": status_dist,
        "top_denial_codes": [{"code": c, "count": n} for c, n in top_denial_codes],
        "payer_summary": [
            {
                "payer": k,
                "claims": v["claims"],
                "denied_cents": v["denied_cents"],
                "won": v["won"],
                "win_rate": round(v["won"] / v["claims"] * 100, 1) if v["claims"] > 0 else 0,
            }
            for k, v in sorted(payer_summary.items(), key=lambda x: x[1]["denied_cents"], reverse=True)
        ],
    }


# ── Bulk Claim Creation ────────────────────────────────────────────────

class BulkClaimItem(BaseModel):
    claim_number: str | None = None
    payer_name: str | None = None
    denial_code: str | None = None
    denial_reason: str | None = None
    raw_denial_text: str
    raw_clinical_notes: str
    amount_denied_cents: int | None = None
    patient_id: str | None = None


class BulkClaimCreate(BaseModel):
    claims: list[BulkClaimItem]


@app.post("/api/v1/claims/bulk", status_code=201)
async def bulk_create_claims(body: BulkClaimCreate, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)

    created = []
    async with app.state.session_factory() as session:
        for item in body.claims:
            claim = Claim(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                clinic_id=DEV_CLINIC_ID,
                patient_id=item.patient_id,
                claim_number=item.claim_number,
                payer_name=item.payer_name,
                denial_code=item.denial_code,
                denial_reason=item.denial_reason,
                raw_denial_text=item.raw_denial_text,
                raw_clinical_notes=item.raw_clinical_notes,
                amount_denied_cents=item.amount_denied_cents,
                filing_deadline=_compute_deadline(item.payer_name),
            )
            session.add(claim)
            await _write_audit(session, tenant_id, user_id, "claim.created", "claim", claim.id, {"source": "bulk"})
            created.append(claim.id)

        await session.commit()

    return {"created": len(created), "claim_ids": created}


# ── Claim Comparison ──────────────────────────────────────────────────

class CompareRequest(BaseModel):
    claim_ids: list[str]


@app.post("/api/v1/claims/compare")
async def compare_claims(body: CompareRequest, request: Request):
    tenant_id = _get_tenant_id(request)
    if len(body.claim_ids) < 2:
        return {"detail": "Need at least 2 claim IDs"}, 400

    async with app.state.session_factory() as session:
        claims_data = []
        for cid in body.claim_ids[:5]:
            claim = await session.get(Claim, cid)
            if claim and claim.tenant_id == tenant_id:
                claims_data.append(_claim_dict(claim))

    if len(claims_data) < 2:
        return {"detail": "Need at least 2 valid claims"}, 400

    fields = ["payer_name", "denial_code", "denial_reason", "amount_denied_cents", "status", "filing_deadline"]
    differences = {}
    for field in fields:
        values = [c.get(field) for c in claims_data]
        if len(set(str(v) for v in values)) > 1:
            differences[field] = values

    return {
        "claims": claims_data,
        "differences": differences,
        "same_payer": len(set(c.get("payer_name") for c in claims_data)) == 1,
        "same_denial_code": len(set(c.get("denial_code") for c in claims_data)) == 1,
        "total_denied_cents": sum(c.get("amount_denied_cents") or 0 for c in claims_data),
    }


# ── Denial Pattern Detector ──────────────────────────────────────────

@app.get("/api/v1/analytics/patterns")
async def denial_patterns(request: Request, min_count: int = Query(default=2, ge=2)):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id)
        result = await session.execute(q)
        claims = result.scalars().all()

    # Group by (payer, denial_code) pairs
    combos: dict[tuple[str, str], list[dict]] = {}
    for c in claims:
        payer = c.payer_name or "Unknown"
        code = c.denial_code or "unknown"
        key = (payer, code)
        if key not in combos:
            combos[key] = []
        combos[key].append(_claim_dict(c))

    patterns = []
    for (payer, code), group_claims in combos.items():
        if len(group_claims) < min_count:
            continue
        total_denied = sum(c.get("amount_denied_cents") or 0 for c in group_claims)
        statuses = {}
        for c in group_claims:
            statuses[c["status"]] = statuses.get(c["status"], 0) + 1

        won = statuses.get("won", 0)
        lost = statuses.get("lost", 0)
        decided = won + lost

        category = DENIAL_CODE_TO_CATEGORY.get(code, "Other")

        patterns.append({
            "payer": payer,
            "denial_code": code,
            "category": category,
            "count": len(group_claims),
            "total_denied_cents": total_denied,
            "avg_denied_cents": total_denied // len(group_claims) if group_claims else 0,
            "statuses": statuses,
            "win_rate": round(won / decided * 100, 1) if decided > 0 else None,
            "claim_ids": [c["id"] for c in group_claims],
            "recommendation": _pattern_recommendation(category, won, lost, len(group_claims)),
        })

    patterns.sort(key=lambda p: p["total_denied_cents"], reverse=True)
    return patterns


def _pattern_recommendation(category: str, won: int, lost: int, total: int) -> str:
    decided = won + lost
    if decided >= 2 and won / decided >= 0.7:
        return "Strong appeal history — continue appealing similar denials."
    if decided >= 2 and lost / decided >= 0.7:
        return "Low win rate — consider process changes or pre-authorization before service."

    recs: dict[str, str] = {
        "Medical Necessity": "Ensure clinical documentation clearly supports necessity before billing.",
        "Timely Filing": "Review submission workflows and track filing deadlines proactively.",
        "Authorization": "Verify prior authorization status before rendering services.",
        "Coding": "Audit coding practices and consider a coding review for these claim types.",
        "Coverage": "Confirm benefit eligibility and coverage before scheduling services.",
        "Duplicate": "Review claim submission process for duplicate prevention.",
        "Bundling": "Review NCCI edits and modifier usage for these procedure combinations.",
        "Fee Schedule": "Review contracted rates and ensure charges align with fee schedules.",
        "Information": "Implement pre-submission checks for required claim data elements.",
    }
    return recs.get(category, "Review denial pattern and consider targeted process improvements.")


# ── Payer Performance Analytics ────────────────────────────────────────

@app.get("/api/v1/analytics/payer-performance")
async def payer_performance(request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id)
        result = await session.execute(q)
        claims = result.scalars().all()

        aq = select(Appeal).where(Appeal.tenant_id == tenant_id)
        ar = await session.execute(aq)
        appeals = ar.scalars().all()

    appeals_by_claim: dict[str, list] = {}
    for a in appeals:
        appeals_by_claim.setdefault(a.claim_id, []).append(a)

    payer_data: dict[str, dict] = {}
    for c in claims:
        payer = c.payer_name or "Unknown"
        if payer not in payer_data:
            payer_data[payer] = {
                "payer": payer,
                "total_claims": 0,
                "total_denied_cents": 0,
                "total_recovered_cents": 0,
                "statuses": {},
                "denial_codes": {},
                "appeals_filed": 0,
                "appeals_won": 0,
                "appeals_lost": 0,
                "avg_days_to_appeal": None,
                "_appeal_days": [],
            }
        pd = payer_data[payer]
        pd["total_claims"] += 1
        pd["total_denied_cents"] += c.amount_denied_cents or 0
        pd["total_recovered_cents"] += c.amount_approved_cents or 0
        s = c.status or "unknown"
        pd["statuses"][s] = pd["statuses"].get(s, 0) + 1
        if c.denial_code:
            pd["denial_codes"][c.denial_code] = pd["denial_codes"].get(c.denial_code, 0) + 1

        claim_appeals = appeals_by_claim.get(c.id, [])
        pd["appeals_filed"] += len(claim_appeals)
        if c.status == "won":
            pd["appeals_won"] += len(claim_appeals)
        elif c.status == "lost":
            pd["appeals_lost"] += len(claim_appeals)
        for ap in claim_appeals:
            if ap.created_at and c.created_at:
                delta = (ap.created_at - c.created_at).days
                if delta >= 0:
                    pd["_appeal_days"].append(delta)

    result_list = []
    for pd in payer_data.values():
        days = pd.pop("_appeal_days")
        pd["avg_days_to_appeal"] = round(sum(days) / len(days), 1) if days else None
        decided = pd["appeals_won"] + pd["appeals_lost"]
        pd["win_rate"] = round(pd["appeals_won"] / decided * 100, 1) if decided > 0 else None
        pd["recovery_rate"] = (
            round(pd["total_recovered_cents"] / pd["total_denied_cents"] * 100, 1)
            if pd["total_denied_cents"] > 0 else None
        )
        pd["top_denial_codes"] = sorted(
            [{"code": k, "count": v} for k, v in pd["denial_codes"].items()],
            key=lambda x: x["count"], reverse=True,
        )[:5]
        del pd["denial_codes"]
        result_list.append(pd)

    result_list.sort(key=lambda x: x["total_denied_cents"], reverse=True)
    return result_list


# ── Financial Recovery Tracker ─────────────────────────────────────────

@app.get("/api/v1/analytics/recovery")
async def recovery_tracker(request: Request, period_days: int = Query(default=90, ge=7, le=365)):
    tenant_id = _get_tenant_id(request)
    cutoff = datetime.utcnow() - timedelta(days=period_days)

    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id, Claim.created_at >= cutoff)
        result = await session.execute(q)
        claims = result.scalars().all()

    weekly: dict[str, dict] = {}
    for c in claims:
        week_start = c.created_at.strftime("%Y-W%U")
        if week_start not in weekly:
            weekly[week_start] = {"week": week_start, "denied_cents": 0, "recovered_cents": 0, "claims": 0}
        weekly[week_start]["denied_cents"] += c.amount_denied_cents or 0
        weekly[week_start]["recovered_cents"] += c.amount_approved_cents or 0
        weekly[week_start]["claims"] += 1

    weeks = sorted(weekly.values(), key=lambda w: w["week"])
    for w in weeks:
        w["recovery_pct"] = (
            round(w["recovered_cents"] / w["denied_cents"] * 100, 1)
            if w["denied_cents"] > 0 else 0.0
        )

    total_denied = sum(c.amount_denied_cents or 0 for c in claims)
    total_recovered = sum(c.amount_approved_cents or 0 for c in claims)

    return {
        "period_days": period_days,
        "total_denied_cents": total_denied,
        "total_recovered_cents": total_recovered,
        "recovery_rate": round(total_recovered / total_denied * 100, 1) if total_denied > 0 else 0.0,
        "total_claims": len(claims),
        "weekly_trend": weeks,
    }


# ── Claim Workflow Pipeline ──────────────────────────────────────────

PIPELINE_STAGES = [
    "pending_review",
    "in_progress",
    "needs_review",
    "approved",
    "sent",
    "won",
    "lost",
    "cancelled",
]


@app.get("/api/v1/analytics/pipeline")
async def claim_pipeline(request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id)
        result = await session.execute(q)
        claims = result.scalars().all()

    stages: dict[str, list[dict]] = {s: [] for s in PIPELINE_STAGES}
    for c in claims:
        status = c.status or "pending_review"
        if status not in stages:
            stages[status] = []
        stages[status].append({
            "id": c.id,
            "claim_number": c.claim_number,
            "payer": c.payer_name,
            "denial_code": c.denial_code,
            "amount_cents": c.amount_denied_cents or 0,
            "days_old": (datetime.utcnow() - c.created_at).days if c.created_at else 0,
        })

    return {
        "stages": [
            {
                "name": s,
                "label": s.replace("_", " ").title(),
                "count": len(stages.get(s, [])),
                "total_cents": sum(c["amount_cents"] for c in stages.get(s, [])),
                "claims": stages.get(s, []),
            }
            for s in PIPELINE_STAGES
        ],
    }


# ── Alerts / Notifications ───────────────────────────────────────────

@app.get("/api/v1/alerts")
async def get_alerts(request: Request):
    tenant_id = _get_tenant_id(request)
    now = datetime.utcnow()

    async with app.state.session_factory() as session:
        q = select(Claim).where(Claim.tenant_id == tenant_id)
        result = await session.execute(q)
        claims = result.scalars().all()

        aq = select(Appeal).where(Appeal.tenant_id == tenant_id, Appeal.needs_review == True)
        ar = await session.execute(aq)
        pending_appeals = ar.scalars().all()

    alerts: list[dict] = []

    for c in claims:
        if c.filing_deadline:
            days_left = (c.filing_deadline - now).days
            if days_left <= 7 and days_left >= 0 and c.status not in ("won", "lost", "cancelled", "sent"):
                alerts.append({
                    "type": "deadline_approaching",
                    "severity": "critical" if days_left <= 3 else "warning",
                    "title": f"Filing deadline in {days_left} day{'s' if days_left != 1 else ''}",
                    "detail": f"{c.claim_number or c.id[:8]} — {c.payer_name}",
                    "claim_id": c.id,
                    "timestamp": now.isoformat(),
                })

        if c.status == "pending_review":
            age_days = (now - c.created_at).days if c.created_at else 0
            if age_days >= 5:
                alerts.append({
                    "type": "stale_claim",
                    "severity": "info" if age_days < 14 else "warning",
                    "title": f"Claim pending review for {age_days} days",
                    "detail": f"{c.claim_number or c.id[:8]} — {c.payer_name}",
                    "claim_id": c.id,
                    "timestamp": now.isoformat(),
                })

    for ap in pending_appeals:
        alerts.append({
            "type": "appeal_needs_review",
            "severity": "info",
            "title": "Appeal needs review",
            "detail": f"Appeal {ap.id[:8]} for claim {ap.claim_id[:8]}",
            "claim_id": ap.claim_id,
            "appeal_id": ap.id,
            "timestamp": now.isoformat(),
        })

    alerts.sort(key=lambda a: {"critical": 0, "warning": 1, "info": 2}.get(a["severity"], 3))
    return alerts


# ── Custom Appeal Templates CRUD ─────────────────────────────────────

class TemplateCreateRequest(BaseModel):
    name: str
    category: str
    sections: list[str]
    source: str
    body_template: str | None = None


class TemplateUpdateRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    sections: list[str] | None = None
    source: str | None = None
    body_template: str | None = None
    is_active: bool | None = None


def _template_dict(t: CustomTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "category": t.category,
        "sections": json.loads(t.sections),
        "source": t.source,
        "body_template": t.body_template,
        "is_active": t.is_active,
        "created_by": t.created_by,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@app.get("/api/v1/custom-templates")
async def list_custom_templates(request: Request, active_only: bool = True):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(CustomTemplate).where(CustomTemplate.tenant_id == tenant_id).order_by(CustomTemplate.created_at.desc())
        if active_only:
            q = q.where(CustomTemplate.is_active == True)
        result = await session.execute(q)
        return [_template_dict(t) for t in result.scalars().all()]


@app.post("/api/v1/custom-templates", status_code=201)
async def create_custom_template(body: TemplateCreateRequest, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    t = CustomTemplate(
        tenant_id=tenant_id,
        name=body.name,
        category=body.category,
        sections=json.dumps(body.sections),
        source=body.source,
        body_template=body.body_template,
        created_by=user_id,
    )
    async with app.state.session_factory() as session:
        session.add(t)
        await session.commit()
        await session.refresh(t)
        return _template_dict(t)


@app.get("/api/v1/custom-templates/{template_id}")
async def get_custom_template(template_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        t = await session.get(CustomTemplate, template_id)
        if not t or t.tenant_id != tenant_id:
            return JSONResponse({"detail": "Template not found"}, status_code=404)
        return _template_dict(t)


@app.patch("/api/v1/custom-templates/{template_id}")
async def update_custom_template(template_id: str, body: TemplateUpdateRequest, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        t = await session.get(CustomTemplate, template_id)
        if not t or t.tenant_id != tenant_id:
            return JSONResponse({"detail": "Template not found"}, status_code=404)
        updates = body.model_dump(exclude_unset=True)
        if "sections" in updates and updates["sections"] is not None:
            updates["sections"] = json.dumps(updates["sections"])
        for k, v in updates.items():
            setattr(t, k, v)
        t.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(t)
        return _template_dict(t)


@app.delete("/api/v1/custom-templates/{template_id}")
async def delete_custom_template(template_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        t = await session.get(CustomTemplate, template_id)
        if not t or t.tenant_id != tenant_id:
            return JSONResponse({"detail": "Template not found"}, status_code=404)
        t.is_active = False
        t.updated_at = datetime.now(timezone.utc)
        await session.commit()
        return {"detail": "Template deactivated"}


# ── Claim Assignment ─────────────────────────────────────────────────

TEAM_MEMBERS = [
    {"id": "dev-user-001", "name": "Demo Biller", "role": "biller"},
    {"id": "dev-user-002", "name": "Sarah Johnson", "role": "biller"},
    {"id": "dev-user-003", "name": "Mike Chen", "role": "reviewer"},
    {"id": "dev-user-004", "name": "Lisa Park", "role": "manager"},
]


class AssignClaimRequest(BaseModel):
    claim_id: str
    assigned_to: str
    note: str | None = None


@app.get("/api/v1/team-members")
async def list_team_members():
    return TEAM_MEMBERS


@app.get("/api/v1/claims/{claim_id}/assignments")
async def get_claim_assignments(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(ClaimAssignment).where(
            ClaimAssignment.tenant_id == tenant_id,
            ClaimAssignment.claim_id == claim_id,
        ).order_by(ClaimAssignment.created_at.desc())
        result = await session.execute(q)
        assignments = result.scalars().all()
        return [
            {
                "id": a.id,
                "claim_id": a.claim_id,
                "assigned_to": a.assigned_to,
                "assigned_by": a.assigned_by,
                "note": a.note,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "assignee_name": next((m["name"] for m in TEAM_MEMBERS if m["id"] == a.assigned_to), a.assigned_to),
            }
            for a in assignments
        ]


@app.post("/api/v1/claims/{claim_id}/assign", status_code=201)
async def assign_claim(claim_id: str, body: AssignClaimRequest, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with app.state.session_factory() as session:
        claim = await session.get(Claim, claim_id)
        if not claim or claim.tenant_id != tenant_id:
            return JSONResponse({"detail": "Claim not found"}, status_code=404)

        assignment = ClaimAssignment(
            tenant_id=tenant_id,
            claim_id=claim_id,
            assigned_to=body.assigned_to,
            assigned_by=user_id,
            note=body.note,
        )
        session.add(assignment)
        await session.commit()
        await session.refresh(assignment)

        assignee_name = next((m["name"] for m in TEAM_MEMBERS if m["id"] == body.assigned_to), body.assigned_to)
        return {
            "id": assignment.id,
            "claim_id": claim_id,
            "assigned_to": body.assigned_to,
            "assignee_name": assignee_name,
            "assigned_by": user_id,
            "note": body.note,
            "created_at": assignment.created_at.isoformat(),
        }


@app.get("/api/v1/assignments")
async def list_all_assignments(
    request: Request,
    assigned_to: str | None = None,
):
    tenant_id = _get_tenant_id(request)
    async with app.state.session_factory() as session:
        q = select(ClaimAssignment).where(ClaimAssignment.tenant_id == tenant_id).order_by(ClaimAssignment.created_at.desc())
        if assigned_to:
            q = q.where(ClaimAssignment.assigned_to == assigned_to)
        result = await session.execute(q)
        assignments = result.scalars().all()

        claim_ids = list({a.claim_id for a in assignments})
        claims_dict = {}
        if claim_ids:
            cq = select(Claim).where(Claim.id.in_(claim_ids))
            cr = await session.execute(cq)
            for c in cr.scalars().all():
                claims_dict[c.id] = _claim_dict(c)

        return [
            {
                "id": a.id,
                "claim_id": a.claim_id,
                "assigned_to": a.assigned_to,
                "assignee_name": next((m["name"] for m in TEAM_MEMBERS if m["id"] == a.assigned_to), a.assigned_to),
                "assigned_by": a.assigned_by,
                "note": a.note,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "claim": claims_dict.get(a.claim_id),
            }
            for a in assignments
        ]


# ── User Activity Analytics ──────────────────────────────────────────

@app.get("/api/v1/analytics/user-activity")
async def user_activity(request: Request, days: int = Query(default=30, le=365)):
    tenant_id = _get_tenant_id(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    async with app.state.session_factory() as session:
        q = select(AuditLog).where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.created_at >= cutoff,
        ).order_by(AuditLog.created_at.desc())
        result = await session.execute(q)
        entries = result.scalars().all()

    by_user: dict[str, dict] = {}
    by_action: dict[str, int] = {}
    daily: dict[str, int] = {}

    for e in entries:
        uid = e.actor_id
        if uid not in by_user:
            by_user[uid] = {"user_id": uid, "role": e.actor_role, "actions": 0, "last_action": None}
        by_user[uid]["actions"] += 1
        if by_user[uid]["last_action"] is None:
            by_user[uid]["last_action"] = e.created_at.isoformat()

        by_action[e.action] = by_action.get(e.action, 0) + 1

        day_key = e.created_at.strftime("%Y-%m-%d")
        daily[day_key] = daily.get(day_key, 0) + 1

    users_sorted = sorted(by_user.values(), key=lambda u: u["actions"], reverse=True)
    actions_sorted = sorted(by_action.items(), key=lambda x: x[1], reverse=True)
    daily_sorted = sorted(daily.items())

    recent = [
        {
            "id": e.id,
            "actor_id": e.actor_id,
            "action": e.action,
            "resource_type": e.resource_type,
            "resource_id": e.resource_id,
            "detail": e.detail,
            "created_at": e.created_at.isoformat(),
        }
        for e in entries[:50]
    ]

    return {
        "period_days": days,
        "total_actions": len(entries),
        "users": users_sorted,
        "actions": [{"action": a, "count": c} for a, c in actions_sorted],
        "daily": [{"date": d, "count": c} for d, c in daily_sorted],
        "recent": recent,
    }


# ── Claim Merge ──────────────────────────────────────────────────────


class MergeRequest(BaseModel):
    primary_claim_id: str
    secondary_claim_ids: list[str]


@app.post("/api/v1/claims/merge")
async def merge_claims(req: Request, body: MergeRequest):
    tenant_id = _get_tenant_id(req)
    user_id = _get_user_id(req)
    async with req.app.state.session_factory() as s:
        primary = await s.get(Claim, body.primary_claim_id)
        if not primary or primary.tenant_id != tenant_id:
            return JSONResponse({"detail": "Primary claim not found"}, 404)

        merged_ids = []
        for sec_id in body.secondary_claim_ids:
            sec = await s.get(Claim, sec_id)
            if not sec or sec.tenant_id != tenant_id:
                continue
            if sec.id == primary.id:
                continue

            if sec.raw_clinical_notes and sec.raw_clinical_notes != primary.raw_clinical_notes:
                existing = primary.raw_clinical_notes or ""
                primary.raw_clinical_notes = existing + "\n\n--- merged from " + (sec.claim_number or sec.id) + " ---\n" + sec.raw_clinical_notes

            if sec.raw_denial_text and sec.raw_denial_text != primary.raw_denial_text:
                existing = primary.raw_denial_text or ""
                primary.raw_denial_text = existing + "\n\n--- merged from " + (sec.claim_number or sec.id) + " ---\n" + sec.raw_denial_text

            sec.status = "cancelled"
            note = ClaimNote(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                claim_id=sec.id,
                author_id=user_id,
                body=f"Merged into {primary.claim_number or primary.id}",
            )
            s.add(note)
            merged_ids.append(sec.id)

        primary_note = ClaimNote(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=primary.id,
            author_id=user_id,
            body=f"Absorbed {len(merged_ids)} claim(s): {', '.join(merged_ids[:5])}",
        )
        s.add(primary_note)

        await _write_audit(s, tenant_id, user_id, "claim.merged", "claim", primary.id, {"merged_ids": merged_ids})
        await s.commit()

    return {"primary_id": primary.id, "merged_count": len(merged_ids), "merged_ids": merged_ids}


# ── Filing Deadline Calendar ──────────────────────────────────────────


PAYER_DEADLINES_DAYS: dict[str, int] = {
    "Aetna": 90,
    "Blue Cross Blue Shield": 120,
    "Cigna": 90,
    "UnitedHealthcare": 180,
    "Medicare": 120,
    "Medicaid": 90,
}
DEFAULT_DEADLINE_DAYS = 90


@app.get("/api/v1/calendar/deadlines")
async def calendar_deadlines(req: Request):
    tenant_id = _get_tenant_id(req)
    async with req.app.state.session_factory() as s:
        result = await s.execute(
            select(Claim).where(
                Claim.tenant_id == tenant_id,
                Claim.status.in_(["pending_review", "in_progress", "needs_review"]),
            )
        )
        claims = result.scalars().all()

    events = []
    now = datetime.now(timezone.utc)
    for c in claims:
        deadline_days = PAYER_DEADLINES_DAYS.get(c.payer_name, DEFAULT_DEADLINE_DAYS) if c.payer_name else DEFAULT_DEADLINE_DAYS
        created = c.created_at if c.created_at.tzinfo else c.created_at.replace(tzinfo=timezone.utc)
        deadline_date = created + timedelta(days=deadline_days)
        days_remaining = (deadline_date - now).days

        events.append({
            "claim_id": c.id,
            "claim_number": c.claim_number,
            "payer_name": c.payer_name,
            "denial_code": c.denial_code,
            "amount_denied_cents": c.amount_denied_cents,
            "status": c.status,
            "created_at": c.created_at.isoformat(),
            "deadline_date": deadline_date.isoformat(),
            "deadline_days": deadline_days,
            "days_remaining": days_remaining,
            "is_overdue": days_remaining < 0,
            "is_urgent": 0 <= days_remaining <= 14,
        })

    events.sort(key=lambda e: e["days_remaining"])
    overdue = sum(1 for e in events if e["is_overdue"])
    urgent = sum(1 for e in events if e["is_urgent"])

    return {
        "events": events,
        "total": len(events),
        "overdue": overdue,
        "urgent": urgent,
        "payer_deadlines": PAYER_DEADLINES_DAYS,
    }


# ── Appeal Letter Preview ────────────────────────────────────────────


@app.get("/api/v1/appeals/{appeal_id}/preview")
async def appeal_preview(appeal_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        appeal = await session.get(Appeal, appeal_id)
        if not appeal or appeal.tenant_id != tenant_id:
            return JSONResponse({"detail": "Appeal not found"}, 404)

        claim = await session.get(Claim, appeal.claim_id)

    return {
        "appeal_id": appeal.id,
        "claim_id": appeal.claim_id,
        "claim_number": claim.claim_number if claim else None,
        "payer_name": claim.payer_name if claim else None,
        "denial_code": claim.denial_code if claim else None,
        "denial_reason": claim.denial_reason if claim else None,
        "amount_denied_cents": claim.amount_denied_cents if claim else None,
        "letter_body": appeal.letter_body,
        "template_used": appeal.template_used,
        "needs_review": appeal.needs_review,
        "approved_by": appeal.approved_by,
        "approved_at": appeal.approved_at.isoformat() if appeal.approved_at else None,
        "created_at": appeal.created_at.isoformat(),
    }


# ── Denial Code Analytics ────────────────────────────────────────────


@app.get("/api/v1/analytics/denial-codes")
async def denial_code_analytics(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )
        claims = result.scalars().all()

    codes: dict[str, dict] = {}
    for c in claims:
        code = c.denial_code or "Unknown"
        if code not in codes:
            codes[code] = {
                "code": code,
                "category": DENIAL_CODE_TO_CATEGORY.get(code, "Other"),
                "total_claims": 0,
                "total_denied_cents": 0,
                "won": 0,
                "lost": 0,
                "pending": 0,
                "payers": {},
            }
        d = codes[code]
        d["total_claims"] += 1
        d["total_denied_cents"] += c.amount_denied_cents or 0
        if c.status == "won":
            d["won"] += 1
        elif c.status == "lost":
            d["lost"] += 1
        elif c.status in ("pending_review", "in_progress", "needs_review", "approved", "sent"):
            d["pending"] += 1
        payer = c.payer_name or "Unknown"
        d["payers"][payer] = d["payers"].get(payer, 0) + 1

    code_list = []
    for d in codes.values():
        decided = d["won"] + d["lost"]
        d["win_rate"] = round(d["won"] / decided * 100) if decided > 0 else 0
        d["avg_amount_cents"] = d["total_denied_cents"] // d["total_claims"] if d["total_claims"] > 0 else 0
        d["payers"] = [{"payer": k, "count": v} for k, v in sorted(d["payers"].items(), key=lambda x: -x[1])]
        code_list.append(d)

    code_list.sort(key=lambda x: -x["total_denied_cents"])

    return {
        "codes": code_list,
        "total_codes": len(code_list),
    }


# ── Dashboard Summary Export ─────────────────────────────────────────


@app.get("/api/v1/reports/summary-text")
async def summary_text_report(request: Request, period_days: int = Query(default=30)):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )
        claims = result.scalars().all()

        appeal_result = await session.execute(
            select(Appeal).where(Appeal.tenant_id == tenant_id)
        )
        appeals = appeal_result.scalars().all()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=period_days)

    total = len(claims)
    total_denied = sum(c.amount_denied_cents or 0 for c in claims)
    won_claims = [c for c in claims if c.status == "won"]
    total_recovered = sum(c.amount_denied_cents or 0 for c in won_claims)
    recent_claims = [c for c in claims if c.created_at.replace(tzinfo=timezone.utc) >= cutoff]

    by_status: dict[str, int] = {}
    for c in claims:
        by_status[c.status] = by_status.get(c.status, 0) + 1

    lines = [
        f"ClaimShield AI — Summary Report ({period_days}-day period)",
        f"Generated: {now.strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "=== Overview ===",
        f"Total Claims: {total}",
        f"Total Denied: ${total_denied / 100:,.2f}",
        f"Total Recovered: ${total_recovered / 100:,.2f}",
        f"Win Rate: {round(len(won_claims) / (len(won_claims) + len([c for c in claims if c.status == 'lost'])) * 100) if (len(won_claims) + len([c for c in claims if c.status == 'lost'])) > 0 else 0}%",
        f"Total Appeals: {len(appeals)}",
        "",
        f"=== Last {period_days} Days ===",
        f"New Claims: {len(recent_claims)}",
        f"New Denied Amount: ${sum(c.amount_denied_cents or 0 for c in recent_claims) / 100:,.2f}",
        "",
        "=== Status Distribution ===",
    ]
    for status, count in sorted(by_status.items(), key=lambda x: -x[1]):
        lines.append(f"  {status.replace('_', ' ')}: {count}")

    lines.append("")
    lines.append("=== Top Denial Codes ===")
    code_counts: dict[str, int] = {}
    for c in claims:
        code = c.denial_code or "Unknown"
        code_counts[code] = code_counts.get(code, 0) + 1
    for code, count in sorted(code_counts.items(), key=lambda x: -x[1])[:10]:
        lines.append(f"  {code}: {count} claims")

    return {"text": "\n".join(lines), "period_days": period_days}


