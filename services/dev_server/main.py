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

from .models import Base, Tenant, Clinic, Claim, Appeal, ClaimNote, ClaimAttachment, UserPreference, AuditLog, CustomTemplate, ClaimAssignment, ClaimTag, PayerResponse, ClaimComment, RoutingRule, ClaimWatchlist, PayerContact, ClaimCost, ClaimLink, DashboardBookmark
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


@app.get("/api/v1/claims/priority-scores")
async def claim_priority_scores(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(
                Claim.tenant_id == tenant_id,
                Claim.status.in_(["pending_review", "in_progress", "needs_review", "approved"]),
            )
        )).scalars().all()

    now = datetime.utcnow()
    scored = []
    for c in claims:
        score = 0
        reasons = []

        amount = c.amount_denied_cents or 0
        if amount >= 500_00:
            score += 30
            reasons.append("high_value")
        elif amount >= 100_00:
            score += 15
            reasons.append("medium_value")

        if c.filing_deadline:
            dl = c.filing_deadline.replace(tzinfo=None) if c.filing_deadline.tzinfo else c.filing_deadline
            days_left = (dl - now).days
            if days_left < 0:
                score += 50
                reasons.append("overdue")
            elif days_left <= 7:
                score += 40
                reasons.append("deadline_urgent")
            elif days_left <= 30:
                score += 20
                reasons.append("deadline_approaching")

        if c.status == "pending_review":
            ca = c.created_at.replace(tzinfo=None) if c.created_at.tzinfo else c.created_at
            age_days = (now - ca).days
            if age_days > 14:
                score += 20
                reasons.append("stale")
            elif age_days > 7:
                score += 10
                reasons.append("aging")

        scored.append({
            "claim_id": c.id,
            "claim_number": c.claim_number,
            "payer_name": c.payer_name,
            "denial_code": c.denial_code,
            "status": c.status,
            "amount_denied_cents": c.amount_denied_cents,
            "filing_deadline": c.filing_deadline.isoformat() if c.filing_deadline else None,
            "priority_score": score,
            "reasons": reasons,
        })

    scored.sort(key=lambda x: x["priority_score"], reverse=True)
    return scored


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


# ── Claim Aging Report ─────────────────────────────────────────────────


@app.get("/api/v1/analytics/aging")
async def claim_aging(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )
        claims = result.scalars().all()

    now = datetime.now(timezone.utc)
    buckets = {"0-7d": 0, "8-14d": 0, "15-30d": 0, "31-60d": 0, "61-90d": 0, "90d+": 0}
    bucket_cents = {"0-7d": 0, "8-14d": 0, "15-30d": 0, "31-60d": 0, "61-90d": 0, "90d+": 0}
    by_status: dict[str, dict[str, int]] = {}

    terminal = {"won", "lost", "cancelled"}
    for c in claims:
        if c.status in terminal:
            continue
        age = (now - c.created_at.replace(tzinfo=timezone.utc)).days
        if age <= 7:
            b = "0-7d"
        elif age <= 14:
            b = "8-14d"
        elif age <= 30:
            b = "15-30d"
        elif age <= 60:
            b = "31-60d"
        elif age <= 90:
            b = "61-90d"
        else:
            b = "90d+"
        buckets[b] += 1
        bucket_cents[b] += c.amount_denied_cents or 0
        if c.status not in by_status:
            by_status[c.status] = {"0-7d": 0, "8-14d": 0, "15-30d": 0, "31-60d": 0, "61-90d": 0, "90d+": 0}
        by_status[c.status][b] += 1

    return {
        "buckets": [
            {"range": k, "count": buckets[k], "amount_cents": bucket_cents[k]}
            for k in buckets
        ],
        "by_status": {
            status: [{"range": k, "count": v} for k, v in ranges.items()]
            for status, ranges in by_status.items()
        },
        "total_open": sum(buckets.values()),
    }


# ── SLA Compliance ─────────────────────────────────────────────────────


@app.get("/api/v1/analytics/sla")
async def sla_compliance(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )
        claims = result.scalars().all()
        audit_result = await session.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant_id).order_by(AuditLog.created_at)
        )
        audits = audit_result.scalars().all()

    sla_targets = {
        "initial_review": 2,
        "appeal_draft": 5,
        "appeal_approval": 3,
        "total_cycle": 14,
    }

    now = datetime.now(timezone.utc)
    metrics: list[dict] = []

    for c in claims:
        created = c.created_at.replace(tzinfo=timezone.utc)
        claim_audits = [a for a in audits if a.resource_id == c.id]

        first_review = None
        for a in claim_audits:
            detail_str = ""
            if a.detail:
                import json as _json
                try:
                    detail_str = _json.dumps(a.detail) if isinstance(a.detail, dict) else str(a.detail)
                except Exception:
                    detail_str = str(a.detail)
            if a.action == "status_change" and "in_progress" in detail_str:
                first_review = a.created_at.replace(tzinfo=timezone.utc)
                break

        days_to_review = (first_review - created).days if first_review else (now - created).days
        review_met = days_to_review <= sla_targets["initial_review"] if first_review else False

        cycle_days = (now - created).days
        cycle_complete = c.status in ("won", "lost", "cancelled", "sent")
        cycle_met = cycle_days <= sla_targets["total_cycle"] if cycle_complete else None

        metrics.append({
            "claim_id": c.id,
            "claim_number": c.claim_number,
            "payer": c.payer_name,
            "status": c.status,
            "age_days": cycle_days,
            "initial_review_days": days_to_review,
            "initial_review_met": review_met,
            "cycle_met": cycle_met,
        })

    met_review = sum(1 for m in metrics if m["initial_review_met"])
    total_with_review = sum(1 for m in metrics if m["initial_review_met"] is not None)
    completed = [m for m in metrics if m["cycle_met"] is not None]
    met_cycle = sum(1 for m in completed if m["cycle_met"])

    return {
        "targets": sla_targets,
        "summary": {
            "total_claims": len(metrics),
            "initial_review_compliance": round(met_review / total_with_review * 100) if total_with_review else 0,
            "cycle_compliance": round(met_cycle / len(completed) * 100) if completed else 0,
            "avg_age_days": round(sum(m["age_days"] for m in metrics) / len(metrics)) if metrics else 0,
        },
        "claims": sorted(metrics, key=lambda x: -x["age_days"]),
    }


# ── CSV Export ─────────────────────────────────────────────────────────


@app.get("/api/v1/claims/export/csv")
async def export_claims_csv(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id).order_by(Claim.created_at.desc())
        )
        claims = result.scalars().all()

    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "claim_number", "payer_name", "denial_code", "denial_reason",
        "amount_denied_cents", "status", "reviewed_by", "created_at", "updated_at",
    ])
    for c in claims:
        writer.writerow([
            c.claim_number, c.payer_name, c.denial_code, c.denial_reason,
            c.amount_denied_cents, c.status, c.reviewed_by,
            c.created_at.isoformat() if c.created_at else "",
            c.updated_at.isoformat() if c.updated_at else "",
        ])

    from starlette.responses import Response
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=claims_export.csv"},
    )


# ── Financial Reconciliation ──────────────────────────────────────────


@app.get("/api/v1/analytics/financials")
async def financial_reconciliation(request: Request, period_days: int = Query(default=90)):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )
        claims = result.scalars().all()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=period_days)

    all_claims = claims
    period_claims = [c for c in claims if c.created_at.replace(tzinfo=timezone.utc) >= cutoff]

    total_denied = sum(c.amount_denied_cents or 0 for c in all_claims)
    total_recovered = sum(c.amount_denied_cents or 0 for c in all_claims if c.status == "won")
    total_lost = sum(c.amount_denied_cents or 0 for c in all_claims if c.status == "lost")
    total_pending = sum(c.amount_denied_cents or 0 for c in all_claims if c.status not in ("won", "lost", "cancelled"))
    total_cancelled = sum(c.amount_denied_cents or 0 for c in all_claims if c.status == "cancelled")

    period_denied = sum(c.amount_denied_cents or 0 for c in period_claims)
    period_recovered = sum(c.amount_denied_cents or 0 for c in period_claims if c.status == "won")

    by_payer: dict[str, dict[str, int]] = {}
    for c in all_claims:
        p = c.payer_name or "Unknown"
        if p not in by_payer:
            by_payer[p] = {"denied": 0, "recovered": 0, "lost": 0, "pending": 0}
        by_payer[p]["denied"] += c.amount_denied_cents or 0
        if c.status == "won":
            by_payer[p]["recovered"] += c.amount_denied_cents or 0
        elif c.status == "lost":
            by_payer[p]["lost"] += c.amount_denied_cents or 0
        elif c.status not in ("cancelled",):
            by_payer[p]["pending"] += c.amount_denied_cents or 0

    monthly: dict[str, dict[str, int]] = {}
    for c in all_claims:
        month = c.created_at.strftime("%Y-%m")
        if month not in monthly:
            monthly[month] = {"denied": 0, "recovered": 0, "claims": 0}
        monthly[month]["denied"] += c.amount_denied_cents or 0
        if c.status == "won":
            monthly[month]["recovered"] += c.amount_denied_cents or 0
        monthly[month]["claims"] += 1

    return {
        "totals": {
            "denied_cents": total_denied,
            "recovered_cents": total_recovered,
            "lost_cents": total_lost,
            "pending_cents": total_pending,
            "cancelled_cents": total_cancelled,
            "net_recovery_rate": round(total_recovered / total_denied * 100) if total_denied else 0,
        },
        "period": {
            "days": period_days,
            "denied_cents": period_denied,
            "recovered_cents": period_recovered,
        },
        "by_payer": [
            {"payer": p, **v} for p, v in sorted(by_payer.items(), key=lambda x: -x[1]["denied"])
        ],
        "monthly_trend": [
            {"month": m, **v} for m, v in sorted(monthly.items())
        ],
    }


# ── Appeal Success Predictor (deterministic) ──────────────────────────


HISTORICAL_WIN_RATES: dict[str, float] = {
    "CO-4": 0.35, "CO-16": 0.55, "CO-18": 0.20, "CO-29": 0.40,
    "CO-45": 0.30, "CO-50": 0.65, "CO-97": 0.45, "CO-109": 0.25,
    "CO-197": 0.60, "CO-204": 0.30, "CO-236": 0.40,
    "PR-1": 0.15, "PR-2": 0.20, "PR-3": 0.10,
}

PAYER_MODIFIER: dict[str, float] = {
    "Aetna": 0.05, "BCBS": 0.0, "Blue Cross Blue Shield": 0.0,
    "Cigna": -0.05, "UnitedHealthcare": -0.10,
    "Medicare": 0.10, "Medicaid": 0.05, "Humana": 0.0,
}


@app.get("/api/v1/claims/{claim_id}/predict")
async def predict_appeal_success(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.id == claim_id, Claim.tenant_id == tenant_id)
        )
        claim = result.scalar_one_or_none()
        if not claim:
            raise HTTPException(404, "Claim not found")

    code = claim.denial_code or ""
    payer = claim.payer_name or ""
    amount = claim.amount_denied_cents or 0

    base_rate = HISTORICAL_WIN_RATES.get(code, 0.30)
    payer_adj = PAYER_MODIFIER.get(payer, 0.0)

    amount_adj = 0.0
    if amount < 50000:
        amount_adj = 0.05
    elif amount > 500000:
        amount_adj = -0.10
    elif amount > 200000:
        amount_adj = -0.05

    has_clinical = bool(claim.raw_clinical_notes and len(claim.raw_clinical_notes) > 50)
    doc_adj = 0.10 if has_clinical else -0.15

    raw_score = base_rate + payer_adj + amount_adj + doc_adj
    score = max(0.05, min(0.95, raw_score))

    factors = []
    factors.append({"factor": "Denial code history", "code": code, "impact": f"{base_rate:.0%} base win rate", "direction": "neutral"})
    if payer_adj > 0:
        factors.append({"factor": "Payer favorability", "payer": payer, "impact": f"+{payer_adj:.0%}", "direction": "positive"})
    elif payer_adj < 0:
        factors.append({"factor": "Payer favorability", "payer": payer, "impact": f"{payer_adj:.0%}", "direction": "negative"})
    if amount_adj != 0:
        factors.append({"factor": "Claim amount", "impact": f"{amount_adj:+.0%}", "direction": "positive" if amount_adj > 0 else "negative"})
    factors.append({"factor": "Clinical documentation", "impact": f"{doc_adj:+.0%}", "direction": "positive" if doc_adj > 0 else "negative"})

    risk = "low" if score >= 0.6 else "medium" if score >= 0.35 else "high"

    return {
        "claim_id": claim_id,
        "predicted_win_probability": round(score, 2),
        "risk_level": risk,
        "factors": factors,
        "recommendation": (
            "Strong case — proceed with appeal" if score >= 0.6
            else "Moderate case — consider strengthening documentation before appeal" if score >= 0.35
            else "Weak case — review denial reason carefully before investing appeal resources"
        ),
        "source": "Deterministic model based on historical win rates by denial code, payer, amount, and documentation quality",
    }


# ── Denial Heatmap ────────────────────────────────────────────────────


@app.get("/api/v1/analytics/heatmap")
async def denial_heatmap(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )
        claims = result.scalars().all()

    matrix: dict[str, dict[str, int]] = {}
    payers_set: set[str] = set()
    codes_set: set[str] = set()

    for c in claims:
        payer = c.payer_name or "Unknown"
        code = c.denial_code or "Unknown"
        payers_set.add(payer)
        codes_set.add(code)
        if payer not in matrix:
            matrix[payer] = {}
        matrix[payer][code] = matrix[payer].get(code, 0) + 1

    payers = sorted(payers_set)
    codes = sorted(codes_set)
    max_val = max((matrix.get(p, {}).get(c, 0) for p in payers for c in codes), default=0)

    cells = []
    for p in payers:
        for c in codes:
            count = matrix.get(p, {}).get(c, 0)
            cells.append({"payer": p, "code": c, "count": count})

    return {"payers": payers, "codes": codes, "cells": cells, "max_count": max_val}


# ── Claim Escalation ──────────────────────────────────────────────────


@app.get("/api/v1/escalations")
async def list_escalations(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(
                Claim.tenant_id == tenant_id,
            ).order_by(Claim.created_at.desc())
        )
        claims = result.scalars().all()
        notes_result = await session.execute(
            select(ClaimNote).where(ClaimNote.tenant_id == tenant_id)
        )
        notes = notes_result.scalars().all()

    now = datetime.now(timezone.utc)
    escalations = []
    for c in claims:
        age = (now - c.created_at.replace(tzinfo=timezone.utc)).days
        amount = c.amount_denied_cents or 0
        claim_notes = [n for n in notes if n.claim_id == c.id and "escalat" in (n.content or "").lower()]

        reasons = []
        if age > 14 and c.status in ("pending_review", "in_progress"):
            reasons.append(f"Stale {age}d in {c.status.replace('_', ' ')}")
        if amount > 1000000:
            reasons.append(f"High value: ${amount / 100:,.2f}")
        if c.status == "lost":
            reasons.append("Appeal lost — consider re-appeal")

        if reasons or claim_notes:
            escalations.append({
                "claim_id": c.id,
                "claim_number": c.claim_number,
                "payer": c.payer_name,
                "status": c.status,
                "amount_denied_cents": amount,
                "age_days": age,
                "reasons": reasons,
                "escalation_notes": [{"content": n.content, "author": n.author_id, "created_at": n.created_at.isoformat()} for n in claim_notes],
                "priority": "high" if amount > 500000 or age > 30 else "medium" if amount > 100000 or age > 14 else "low",
            })

    escalations.sort(key=lambda x: ({"high": 0, "medium": 1, "low": 2}.get(x["priority"], 3), -x["age_days"]))
    return escalations


@app.post("/api/v1/claims/{claim_id}/escalate", status_code=201)
async def escalate_claim(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()
    reason = body.get("reason", "Escalated for review")

    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(Claim).where(Claim.id == claim_id, Claim.tenant_id == tenant_id)
        )
        claim = result.scalar_one_or_none()
        if not claim:
            raise HTTPException(404, "Claim not found")

        note = ClaimNote(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=claim_id,
            author_id=user_id,
            content=f"[ESCALATION] {reason}",
        )
        session.add(note)
        await _write_audit(session, tenant_id, user_id, "escalate", "claim", claim_id, {"reason": reason})
        await session.commit()

    return {"status": "escalated", "claim_id": claim_id, "note_id": note.id}


# ---------------------------------------------------------------------------
# Team Performance
# ---------------------------------------------------------------------------

TEAM_MEMBERS = {
    "dev-user-001": "Alice Chen",
    "dev-user-002": "Bob Martinez",
    "dev-user-003": "Carol Williams",
    "dev-user-004": "David Kim",
}

@app.get("/api/v1/analytics/team-performance")
async def team_performance(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()

        assignments = (await session.execute(
            select(ClaimAssignment).where(ClaimAssignment.tenant_id == tenant_id)
        )).scalars().all()

        appeals = (await session.execute(
            select(Appeal).where(Appeal.tenant_id == tenant_id)
        )).scalars().all()

        audits = (await session.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        )).scalars().all()

    claim_map = {c.id: c for c in claims}
    appeal_map: dict[str, list] = {}
    for a in appeals:
        appeal_map.setdefault(a.claim_id, []).append(a)

    assigned_claims: dict[str, list[str]] = {}
    for a in assignments:
        assigned_claims.setdefault(a.assigned_to, []).append(a.claim_id)

    actions_by_user: dict[str, int] = {}
    for a in audits:
        actions_by_user[a.actor_id] = actions_by_user.get(a.actor_id, 0) + 1

    result = []
    for user_id, name in TEAM_MEMBERS.items():
        user_claim_ids = set(assigned_claims.get(user_id, []))
        user_claims = [claim_map[cid] for cid in user_claim_ids if cid in claim_map]
        total = len(user_claims)
        won = sum(1 for c in user_claims if c.status == "won")
        lost = sum(1 for c in user_claims if c.status == "lost")
        pending = sum(1 for c in user_claims if c.status in ("pending_review", "in_progress", "needs_review"))
        decided = won + lost
        win_rate = round(won / decided, 2) if decided > 0 else None

        total_denied = sum(c.amount_denied_cents or 0 for c in user_claims)
        total_recovered = sum(c.amount_approved_cents or 0 for c in user_claims if c.status == "won")

        appeals_drafted = 0
        for cid in user_claim_ids:
            appeals_drafted += len(appeal_map.get(cid, []))

        result.append({
            "user_id": user_id,
            "name": name,
            "claims_assigned": total,
            "claims_won": won,
            "claims_lost": lost,
            "claims_pending": pending,
            "win_rate": win_rate,
            "total_denied_cents": total_denied,
            "total_recovered_cents": total_recovered,
            "appeals_drafted": appeals_drafted,
            "audit_actions": actions_by_user.get(user_id, 0),
        })

    result.sort(key=lambda x: x["claims_assigned"], reverse=True)
    return result


# ---------------------------------------------------------------------------
# Claim Tags
# ---------------------------------------------------------------------------

@app.get("/api/v1/claims/{claim_id}/tags")
async def get_claim_tags(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        tags = (await session.execute(
            select(ClaimTag).where(ClaimTag.claim_id == claim_id, ClaimTag.tenant_id == tenant_id)
        )).scalars().all()
    return [{"id": t.id, "tag": t.tag, "created_by": t.created_by, "created_at": t.created_at.isoformat()} for t in tags]


@app.post("/api/v1/claims/{claim_id}/tags", status_code=201)
async def add_claim_tag(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")
    tag_name = body.get("tag", "").strip()
    if not tag_name:
        raise HTTPException(400, "Tag name required")

    async with request.app.state.session_factory() as session:
        existing = (await session.execute(
            select(ClaimTag).where(
                ClaimTag.claim_id == claim_id,
                ClaimTag.tenant_id == tenant_id,
                ClaimTag.tag == tag_name,
            )
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(409, "Tag already exists on this claim")

        tag = ClaimTag(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=claim_id,
            tag=tag_name,
            created_by=user_id,
        )
        session.add(tag)
        await _write_audit(session, tenant_id, user_id, "tag.added", "claim", claim_id, {"tag": tag_name})
        await session.commit()

    return {"id": tag.id, "tag": tag.tag, "created_by": tag.created_by}


@app.delete("/api/v1/claims/{claim_id}/tags/{tag_id}")
async def remove_claim_tag(claim_id: str, tag_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        tag = (await session.execute(
            select(ClaimTag).where(ClaimTag.id == tag_id, ClaimTag.tenant_id == tenant_id)
        )).scalar_one_or_none()
        if not tag:
            raise HTTPException(404, "Tag not found")
        tag_name = tag.tag
        await session.delete(tag)
        await _write_audit(session, tenant_id, user_id, "tag.removed", "claim", claim_id, {"tag": tag_name})
        await session.commit()
    return {"status": "removed"}


@app.get("/api/v1/tags")
async def list_all_tags(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(ClaimTag.tag, func.count(ClaimTag.id).label("count"))
            .where(ClaimTag.tenant_id == tenant_id)
            .group_by(ClaimTag.tag)
            .order_by(func.count(ClaimTag.id).desc())
        )).all()
    return [{"tag": r[0], "count": r[1]} for r in rows]


# ---------------------------------------------------------------------------
# Payer Response Tracking
# ---------------------------------------------------------------------------

@app.get("/api/v1/claims/{claim_id}/responses")
async def get_payer_responses(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        responses = (await session.execute(
            select(PayerResponse)
            .where(PayerResponse.claim_id == claim_id, PayerResponse.tenant_id == tenant_id)
            .order_by(PayerResponse.received_at.desc())
        )).scalars().all()
    return [{
        "id": r.id,
        "claim_id": r.claim_id,
        "appeal_id": r.appeal_id,
        "response_type": r.response_type,
        "response_text": r.response_text,
        "amount_approved_cents": r.amount_approved_cents,
        "received_at": r.received_at.isoformat(),
        "recorded_by": r.recorded_by,
    } for r in responses]


@app.post("/api/v1/claims/{claim_id}/responses", status_code=201)
async def record_payer_response(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()
    response_type = body.get("response_type", "")
    if response_type not in ("approved", "denied", "partial", "additional_info_requested", "other"):
        raise HTTPException(400, "Invalid response_type")

    async with request.app.state.session_factory() as session:
        claim = (await session.execute(
            select(Claim).where(Claim.id == claim_id, Claim.tenant_id == tenant_id)
        )).scalar_one_or_none()
        if not claim:
            raise HTTPException(404, "Claim not found")

        resp = PayerResponse(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=claim_id,
            appeal_id=body.get("appeal_id"),
            response_type=response_type,
            response_text=body.get("response_text"),
            amount_approved_cents=body.get("amount_approved_cents"),
            recorded_by=user_id,
        )
        session.add(resp)
        await _write_audit(session, tenant_id, user_id, "payer_response.recorded", "claim", claim_id, {
            "response_type": response_type,
            "amount_approved_cents": body.get("amount_approved_cents"),
        })
        await session.commit()

    return {"id": resp.id, "response_type": resp.response_type}


# ---------------------------------------------------------------------------
# Provider / Clinic Analytics
# ---------------------------------------------------------------------------

@app.get("/api/v1/analytics/clinics")
async def clinic_analytics(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        clinics = (await session.execute(
            select(Clinic).where(Clinic.tenant_id == tenant_id)
        )).scalars().all()

        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()

    clinic_map = {c.id: c for c in clinics}
    stats: dict[str, dict] = {}
    for c in claims:
        cid = c.clinic_id
        if cid not in stats:
            clinic = clinic_map.get(cid)
            stats[cid] = {
                "clinic_id": cid,
                "clinic_name": clinic.name if clinic else "Unknown",
                "npi": clinic.npi if clinic else None,
                "total_claims": 0,
                "total_denied_cents": 0,
                "total_recovered_cents": 0,
                "won": 0,
                "lost": 0,
                "pending": 0,
                "top_denial_codes": {},
            }
        s = stats[cid]
        s["total_claims"] += 1
        s["total_denied_cents"] += c.amount_denied_cents or 0
        if c.status == "won":
            s["won"] += 1
            s["total_recovered_cents"] += c.amount_approved_cents or 0
        elif c.status == "lost":
            s["lost"] += 1
        elif c.status in ("pending_review", "in_progress", "needs_review"):
            s["pending"] += 1
        if c.denial_code:
            s["top_denial_codes"][c.denial_code] = s["top_denial_codes"].get(c.denial_code, 0) + 1

    result = []
    for s in stats.values():
        decided = s["won"] + s["lost"]
        s["win_rate"] = round(s["won"] / decided, 2) if decided > 0 else None
        codes = sorted(s["top_denial_codes"].items(), key=lambda x: -x[1])[:5]
        s["top_denial_codes"] = [{"code": k, "count": v} for k, v in codes]
        result.append(s)

    result.sort(key=lambda x: x["total_denied_cents"], reverse=True)
    return result


# ---------------------------------------------------------------------------
# Claim Status History (derived from audit log)
# ---------------------------------------------------------------------------

@app.get("/api/v1/claims/{claim_id}/status-history")
async def claim_status_history(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        audits = (await session.execute(
            select(AuditLog)
            .where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.resource_id == claim_id,
                AuditLog.action.in_(["claim.created", "claim.status_changed"]),
            )
            .order_by(AuditLog.created_at.asc())
        )).scalars().all()

    history = []
    for a in audits:
        detail = {}
        if a.detail:
            try:
                detail = json.loads(a.detail) if isinstance(a.detail, str) else a.detail
            except (json.JSONDecodeError, TypeError):
                pass
        history.append({
            "timestamp": a.created_at.isoformat(),
            "action": a.action,
            "actor_id": a.actor_id,
            "from_status": detail.get("from_status"),
            "to_status": detail.get("to_status") or detail.get("status"),
        })
    return history


# ---------------------------------------------------------------------------
# Batch Tag Operations
# ---------------------------------------------------------------------------

@app.post("/api/v1/tags/batch")
async def batch_tag_claims(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()
    claim_ids = body.get("claim_ids", [])
    tag_name = body.get("tag", "").strip()
    action = body.get("action", "add")

    if not tag_name or not claim_ids:
        raise HTTPException(400, "claim_ids and tag required")

    added = 0
    removed = 0
    async with request.app.state.session_factory() as session:
        for cid in claim_ids:
            if action == "add":
                existing = (await session.execute(
                    select(ClaimTag).where(
                        ClaimTag.claim_id == cid,
                        ClaimTag.tenant_id == tenant_id,
                        ClaimTag.tag == tag_name,
                    )
                )).scalar_one_or_none()
                if not existing:
                    session.add(ClaimTag(
                        id=str(uuid.uuid4()),
                        tenant_id=tenant_id,
                        claim_id=cid,
                        tag=tag_name,
                        created_by=user_id,
                    ))
                    added += 1
            elif action == "remove":
                existing = (await session.execute(
                    select(ClaimTag).where(
                        ClaimTag.claim_id == cid,
                        ClaimTag.tenant_id == tenant_id,
                        ClaimTag.tag == tag_name,
                    )
                )).scalar_one_or_none()
                if existing:
                    await session.delete(existing)
                    removed += 1
        await session.commit()

    return {"added": added, "removed": removed, "tag": tag_name, "claim_count": len(claim_ids)}


# ---------------------------------------------------------------------------
# KPI Scorecard
# ---------------------------------------------------------------------------

@app.get("/api/v1/analytics/scorecard")
async def kpi_scorecard(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()

        appeals = (await session.execute(
            select(Appeal).where(Appeal.tenant_id == tenant_id)
        )).scalars().all()

    now = datetime.now(timezone.utc)
    total = len(claims)
    won = sum(1 for c in claims if c.status == "won")
    lost = sum(1 for c in claims if c.status == "lost")
    pending = sum(1 for c in claims if c.status in ("pending_review", "in_progress", "needs_review"))
    decided = won + lost

    total_denied = sum(c.amount_denied_cents or 0 for c in claims)
    total_recovered = sum(c.amount_approved_cents or 0 for c in claims if c.status == "won")
    total_lost = sum(c.amount_denied_cents or 0 for c in claims if c.status == "lost")

    open_claims = [c for c in claims if c.status in ("pending_review", "in_progress", "needs_review", "approved", "sent")]
    avg_age_days = 0.0
    if open_claims:
        ages = [(now - c.created_at.replace(tzinfo=timezone.utc)).days for c in open_claims]
        avg_age_days = round(sum(ages) / len(ages), 1)

    appeals_pending = sum(1 for a in appeals if a.needs_review)
    appeals_approved = sum(1 for a in appeals if a.approved_by)

    overdue = sum(1 for c in claims if c.filing_deadline and c.filing_deadline.replace(tzinfo=timezone.utc) < now and c.status not in ("won", "lost", "cancelled", "sent"))

    return {
        "total_claims": total,
        "won": won,
        "lost": lost,
        "pending": pending,
        "win_rate": round(won / decided, 3) if decided > 0 else None,
        "total_denied_cents": total_denied,
        "total_recovered_cents": total_recovered,
        "total_lost_cents": total_lost,
        "recovery_rate": round(total_recovered / total_denied, 3) if total_denied > 0 else None,
        "open_claims": len(open_claims),
        "avg_open_age_days": avg_age_days,
        "appeals_pending_review": appeals_pending,
        "appeals_approved": appeals_approved,
        "overdue_claims": overdue,
    }


# ---------------------------------------------------------------------------
# Notification Preferences
# ---------------------------------------------------------------------------

@app.get("/api/v1/notifications/preferences")
async def get_notification_prefs(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        prefs = (await session.execute(
            select(UserPreference).where(
                UserPreference.tenant_id == tenant_id,
                UserPreference.user_id == user_id,
                UserPreference.key.like("notif_%"),
            )
        )).scalars().all()

    defaults = {
        "notif_deadline_warning": "true",
        "notif_status_change": "true",
        "notif_appeal_approved": "true",
        "notif_escalation": "true",
        "notif_assignment": "true",
        "notif_payer_response": "true",
    }
    result = dict(defaults)
    for p in prefs:
        result[p.key] = p.value
    return result


@app.put("/api/v1/notifications/preferences")
async def update_notification_prefs(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()

    async with request.app.state.session_factory() as session:
        for key, value in body.items():
            if not key.startswith("notif_"):
                continue
            existing = (await session.execute(
                select(UserPreference).where(
                    UserPreference.tenant_id == tenant_id,
                    UserPreference.user_id == user_id,
                    UserPreference.key == key,
                )
            )).scalar_one_or_none()
            if existing:
                existing.value = str(value)
                existing.updated_at = datetime.now(timezone.utc)
            else:
                session.add(UserPreference(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_id,
                    user_id=user_id,
                    key=key,
                    value=str(value),
                ))
        await session.commit()

    return {"status": "updated"}


# ---------------------------------------------------------------------------
# Denial Trends (monthly aggregation)
# ---------------------------------------------------------------------------

@app.get("/api/v1/analytics/trends")
async def denial_trends(request: Request):
    tenant_id = _get_tenant_id(request)
    months = int(request.query_params.get("months", "6"))
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()

    now = datetime.now(timezone.utc)
    buckets: dict[str, dict] = {}
    for i in range(months):
        dt = now - timedelta(days=30 * i)
        key = dt.strftime("%Y-%m")
        buckets[key] = {
            "month": key,
            "new_claims": 0,
            "total_denied_cents": 0,
            "total_recovered_cents": 0,
            "won": 0,
            "lost": 0,
            "by_code": {},
            "by_payer": {},
        }

    for c in claims:
        key = c.created_at.strftime("%Y-%m")
        if key not in buckets:
            continue
        b = buckets[key]
        b["new_claims"] += 1
        b["total_denied_cents"] += c.amount_denied_cents or 0
        if c.status == "won":
            b["won"] += 1
            b["total_recovered_cents"] += c.amount_approved_cents or 0
        elif c.status == "lost":
            b["lost"] += 1
        if c.denial_code:
            b["by_code"][c.denial_code] = b["by_code"].get(c.denial_code, 0) + 1
        if c.payer_name:
            b["by_payer"][c.payer_name] = b["by_payer"].get(c.payer_name, 0) + 1

    result = []
    for key in sorted(buckets.keys()):
        b = buckets[key]
        b["top_codes"] = sorted(b["by_code"].items(), key=lambda x: -x[1])[:5]
        b["top_payers"] = sorted(b["by_payer"].items(), key=lambda x: -x[1])[:5]
        del b["by_code"]
        del b["by_payer"]
        b["top_codes"] = [{"code": c, "count": n} for c, n in b["top_codes"]]
        b["top_payers"] = [{"payer": p, "count": n} for p, n in b["top_payers"]]
        result.append(b)

    return result


# ---------------------------------------------------------------------------
# Data Export Dashboard (list available exports)
# ---------------------------------------------------------------------------

@app.get("/api/v1/exports")
async def list_exports(request: Request):
    return [
        {
            "id": "claims-csv",
            "name": "Claims CSV Export",
            "description": "All claims with status, amounts, and denial codes",
            "url": "/api/v1/claims/export/csv",
            "format": "CSV",
        },
        {
            "id": "summary-text",
            "name": "Summary Text Report",
            "description": "Plain-text executive summary of denial operations",
            "url": "/api/v1/reports/summary-text",
            "format": "TXT",
        },
        {
            "id": "scorecard-json",
            "name": "KPI Scorecard (JSON)",
            "description": "Machine-readable KPI data for dashboards",
            "url": "/api/v1/analytics/scorecard",
            "format": "JSON",
        },
        {
            "id": "financials-json",
            "name": "Financial Report (JSON)",
            "description": "Reconciliation data with monthly trends",
            "url": "/api/v1/analytics/financials",
            "format": "JSON",
        },
        {
            "id": "team-json",
            "name": "Team Performance (JSON)",
            "description": "Per-member productivity metrics",
            "url": "/api/v1/analytics/team-performance",
            "format": "JSON",
        },
    ]


# ---------------------------------------------------------------------------
# System Health / Status
# ---------------------------------------------------------------------------

@app.get("/api/v1/system/health")
async def system_health(request: Request):
    import time
    start = time.monotonic()
    tenant_id = _get_tenant_id(request)

    db_ok = False
    claim_count = 0
    appeal_count = 0
    audit_count = 0
    try:
        async with request.app.state.session_factory() as session:
            claim_count = (await session.execute(
                select(func.count(Claim.id)).where(Claim.tenant_id == tenant_id)
            )).scalar_one()
            appeal_count = (await session.execute(
                select(func.count(Appeal.id)).where(Appeal.tenant_id == tenant_id)
            )).scalar_one()
            audit_count = (await session.execute(
                select(func.count(AuditLog.id)).where(AuditLog.tenant_id == tenant_id)
            )).scalar_one()
            db_ok = True
    except Exception:
        pass

    elapsed_ms = round((time.monotonic() - start) * 1000, 1)

    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "error",
        "response_time_ms": elapsed_ms,
        "counts": {
            "claims": claim_count,
            "appeals": appeal_count,
            "audit_entries": audit_count,
        },
        "version": "0.1.0-dev",
        "environment": "development",
    }


# ---------------------------------------------------------------------------
# Claim Comments / Collaboration
# ---------------------------------------------------------------------------

ROLE_PERMISSIONS = {
    "admin": ["read", "write", "approve", "send", "assign", "manage_users", "manage_rules", "view_audit", "export"],
    "manager": ["read", "write", "approve", "send", "assign", "view_audit", "export"],
    "biller": ["read", "write", "approve", "send", "export"],
    "reviewer": ["read", "write", "approve"],
    "viewer": ["read"],
}


@app.get("/api/v1/roles")
async def list_roles(request: Request):
    _get_tenant_id(request)
    return [
        {"role": role, "permissions": perms, "user_count": sum(1 for u in TEAM_MEMBERS if True)}
        for role, perms in ROLE_PERMISSIONS.items()
    ]


@app.get("/api/v1/claims/{claim_id}/comments")
async def list_comments(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(ClaimComment)
            .where(ClaimComment.tenant_id == tenant_id, ClaimComment.claim_id == claim_id)
            .order_by(ClaimComment.created_at.asc())
        )).scalars().all()
        return [
            {
                "id": c.id,
                "claim_id": c.claim_id,
                "parent_id": c.parent_id,
                "author_id": c.author_id,
                "author_name": TEAM_MEMBERS.get(c.author_id, c.author_id),
                "body": c.body,
                "created_at": c.created_at.isoformat(),
            }
            for c in rows
        ]


@app.post("/api/v1/claims/{claim_id}/comments", status_code=201)
async def add_comment(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()
    text = (body.get("body") or "").strip()
    if not text:
        return JSONResponse({"detail": "body is required"}, status_code=400)
    parent_id = body.get("parent_id")

    async with request.app.state.session_factory() as session:
        comment = ClaimComment(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=claim_id,
            parent_id=parent_id,
            author_id=user_id,
            body=text,
        )
        session.add(comment)
        await session.commit()

        await _write_audit(session, tenant_id, user_id, "comment.create", "claim", claim_id,
                           {"comment_id": comment.id, "parent_id": parent_id})
        return {
            "id": comment.id,
            "claim_id": claim_id,
            "parent_id": parent_id,
            "author_id": user_id,
            "author_name": TEAM_MEMBERS.get(user_id, user_id),
            "body": text,
            "created_at": comment.created_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# Appeal Effectiveness Analytics
# ---------------------------------------------------------------------------

@app.get("/api/v1/analytics/appeal-effectiveness")
async def appeal_effectiveness(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()
        appeals = (await session.execute(
            select(Appeal).where(Appeal.tenant_id == tenant_id)
        )).scalars().all()
        responses = (await session.execute(
            select(PayerResponse).where(PayerResponse.tenant_id == tenant_id)
        )).scalars().all()

    claim_map = {c.id: c for c in claims}
    appeal_map = {a.claim_id: a for a in appeals}
    response_map: dict[str, list] = {}
    for r in responses:
        response_map.setdefault(r.claim_id, []).append(r)

    by_code: dict[str, dict] = {}
    by_payer: dict[str, dict] = {}

    for c in claims:
        code = c.denial_code or "UNKNOWN"
        payer = c.payer_name or "Unknown"

        for bucket_key, bucket_dict in [(code, by_code), (payer, by_payer)]:
            if bucket_key not in bucket_dict:
                bucket_dict[bucket_key] = {"total": 0, "appealed": 0, "won": 0, "lost": 0, "pending": 0,
                                           "denied_cents": 0, "recovered_cents": 0}
            b = bucket_dict[bucket_key]
            b["total"] += 1
            b["denied_cents"] += c.amount_denied_cents or 0

            if c.id in appeal_map:
                b["appealed"] += 1
            if c.status == "won":
                b["won"] += 1
                b["recovered_cents"] += c.amount_approved_cents or 0
            elif c.status == "lost":
                b["lost"] += 1
            elif c.status in ("in_progress", "needs_review", "approved", "sent"):
                b["pending"] += 1

    def _make_list(d: dict) -> list:
        out = []
        for k, v in d.items():
            win_rate = round(v["won"] / v["appealed"] * 100, 1) if v["appealed"] > 0 else 0.0
            out.append({"key": k, **v, "win_rate": win_rate})
        out.sort(key=lambda x: x["total"], reverse=True)
        return out

    return {
        "by_denial_code": _make_list(by_code),
        "by_payer": _make_list(by_payer),
        "total_claims": len(claims),
        "total_appeals": len(appeals),
    }


# ---------------------------------------------------------------------------
# Claim Routing Rules
# ---------------------------------------------------------------------------

@app.get("/api/v1/routing-rules")
async def list_routing_rules(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(RoutingRule)
            .where(RoutingRule.tenant_id == tenant_id)
            .order_by(RoutingRule.priority.asc())
        )).scalars().all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "priority": r.priority,
                "match_payer": r.match_payer,
                "match_denial_code": r.match_denial_code,
                "min_amount_cents": r.min_amount_cents,
                "max_amount_cents": r.max_amount_cents,
                "assign_to": r.assign_to,
                "assign_to_name": TEAM_MEMBERS.get(r.assign_to, r.assign_to),
                "is_active": r.is_active,
                "created_by": r.created_by,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]


@app.post("/api/v1/routing-rules", status_code=201)
async def create_routing_rule(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()

    name = (body.get("name") or "").strip()
    if not name:
        return JSONResponse({"detail": "name is required"}, status_code=400)
    assign_to = body.get("assign_to", "")
    if not assign_to:
        return JSONResponse({"detail": "assign_to is required"}, status_code=400)

    async with request.app.state.session_factory() as session:
        rule = RoutingRule(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            name=name,
            priority=body.get("priority", 100),
            match_payer=body.get("match_payer"),
            match_denial_code=body.get("match_denial_code"),
            min_amount_cents=body.get("min_amount_cents"),
            max_amount_cents=body.get("max_amount_cents"),
            assign_to=assign_to,
            is_active=body.get("is_active", True),
            created_by=user_id,
        )
        session.add(rule)
        await session.commit()

        await _write_audit(session, tenant_id, user_id, "routing_rule.create", "routing_rule", rule.id,
                           {"name": name, "assign_to": assign_to})
        return {"id": rule.id, "name": name}


@app.delete("/api/v1/routing-rules/{rule_id}")
async def delete_routing_rule(rule_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        rule = (await session.execute(
            select(RoutingRule).where(RoutingRule.tenant_id == tenant_id, RoutingRule.id == rule_id)
        )).scalar_one_or_none()
        if not rule:
            return JSONResponse({"detail": "not found"}, status_code=404)
        await session.delete(rule)
        await session.commit()
        await _write_audit(session, tenant_id, user_id, "routing_rule.delete", "routing_rule", rule_id, {})
        return {"deleted": True}


@app.post("/api/v1/claims/{claim_id}/auto-route")
async def auto_route_claim(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        claim = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id, Claim.id == claim_id)
        )).scalar_one_or_none()
        if not claim:
            return JSONResponse({"detail": "claim not found"}, status_code=404)

        rules = (await session.execute(
            select(RoutingRule)
            .where(RoutingRule.tenant_id == tenant_id, RoutingRule.is_active == True)
            .order_by(RoutingRule.priority.asc())
        )).scalars().all()

        matched_rule = None
        for rule in rules:
            if rule.match_payer and rule.match_payer.lower() != (claim.payer_name or "").lower():
                continue
            if rule.match_denial_code and rule.match_denial_code != claim.denial_code:
                continue
            if rule.min_amount_cents is not None and (claim.amount_denied_cents or 0) < rule.min_amount_cents:
                continue
            if rule.max_amount_cents is not None and (claim.amount_denied_cents or 0) > rule.max_amount_cents:
                continue
            matched_rule = rule
            break

        if not matched_rule:
            return {"routed": False, "reason": "no matching rule"}

        assignment = ClaimAssignment(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=claim_id,
            assigned_to=matched_rule.assign_to,
            assigned_by="system:auto-route",
            note=f"Auto-routed by rule: {matched_rule.name}",
        )
        session.add(assignment)
        await session.commit()

        await _write_audit(session, tenant_id, user_id, "claim.auto_route", "claim", claim_id,
                           {"rule_id": matched_rule.id, "rule_name": matched_rule.name,
                            "assigned_to": matched_rule.assign_to})
        return {
            "routed": True,
            "rule_id": matched_rule.id,
            "rule_name": matched_rule.name,
            "assigned_to": matched_rule.assign_to,
            "assigned_to_name": TEAM_MEMBERS.get(matched_rule.assign_to, matched_rule.assign_to),
        }


# ---------------------------------------------------------------------------
# Claim Watchlist
# ---------------------------------------------------------------------------

@app.get("/api/v1/watchlist")
async def get_watchlist(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(ClaimWatchlist)
            .where(ClaimWatchlist.tenant_id == tenant_id, ClaimWatchlist.user_id == user_id)
            .order_by(ClaimWatchlist.created_at.desc())
        )).scalars().all()
        claim_ids = [w.claim_id for w in rows]
        if not claim_ids:
            return []
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id, Claim.id.in_(claim_ids))
        )).scalars().all()
        claim_map = {c.id: c for c in claims}
        result = []
        for w in rows:
            c = claim_map.get(w.claim_id)
            if c:
                result.append({
                    "watchlist_id": w.id,
                    "claim_id": c.id,
                    "claim_number": c.claim_number,
                    "payer_name": c.payer_name,
                    "denial_code": c.denial_code,
                    "status": c.status,
                    "amount_denied_cents": c.amount_denied_cents,
                    "added_at": w.created_at.isoformat(),
                })
        return result


@app.post("/api/v1/watchlist", status_code=201)
async def add_to_watchlist(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()
    claim_id = body.get("claim_id", "")
    if not claim_id:
        return JSONResponse({"detail": "claim_id required"}, status_code=400)

    async with request.app.state.session_factory() as session:
        existing = (await session.execute(
            select(ClaimWatchlist).where(
                ClaimWatchlist.tenant_id == tenant_id,
                ClaimWatchlist.user_id == user_id,
                ClaimWatchlist.claim_id == claim_id,
            )
        )).scalar_one_or_none()
        if existing:
            return {"id": existing.id, "already_watched": True}

        entry = ClaimWatchlist(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=claim_id,
            user_id=user_id,
        )
        session.add(entry)
        await session.commit()
        return {"id": entry.id, "claim_id": claim_id}


@app.delete("/api/v1/watchlist/{watchlist_id}")
async def remove_from_watchlist(watchlist_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        entry = (await session.execute(
            select(ClaimWatchlist).where(
                ClaimWatchlist.tenant_id == tenant_id,
                ClaimWatchlist.id == watchlist_id,
                ClaimWatchlist.user_id == user_id,
            )
        )).scalar_one_or_none()
        if not entry:
            return JSONResponse({"detail": "not found"}, status_code=404)
        await session.delete(entry)
        await session.commit()
        return {"deleted": True}


# ---------------------------------------------------------------------------
# Payer Contacts Directory
# ---------------------------------------------------------------------------

@app.get("/api/v1/payer-contacts")
async def list_payer_contacts(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(PayerContact)
            .where(PayerContact.tenant_id == tenant_id)
            .order_by(PayerContact.payer_name.asc())
        )).scalars().all()
        return [
            {
                "id": pc.id,
                "payer_name": pc.payer_name,
                "contact_name": pc.contact_name,
                "phone": pc.phone,
                "fax": pc.fax,
                "email": pc.email,
                "address": pc.address,
                "department": pc.department,
                "notes": pc.notes,
                "created_at": pc.created_at.isoformat(),
            }
            for pc in rows
        ]


@app.post("/api/v1/payer-contacts", status_code=201)
async def create_payer_contact(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()
    payer_name = (body.get("payer_name") or "").strip()
    if not payer_name:
        return JSONResponse({"detail": "payer_name required"}, status_code=400)

    async with request.app.state.session_factory() as session:
        pc = PayerContact(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            payer_name=payer_name,
            contact_name=body.get("contact_name"),
            phone=body.get("phone"),
            fax=body.get("fax"),
            email=body.get("email"),
            address=body.get("address"),
            department=body.get("department"),
            notes=body.get("notes"),
            created_by=user_id,
        )
        session.add(pc)
        await session.commit()
        await _write_audit(session, tenant_id, user_id, "payer_contact.create", "payer_contact", pc.id,
                           {"payer_name": payer_name})
        return {"id": pc.id, "payer_name": payer_name}


@app.delete("/api/v1/payer-contacts/{contact_id}")
async def delete_payer_contact(contact_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        pc = (await session.execute(
            select(PayerContact).where(PayerContact.tenant_id == tenant_id, PayerContact.id == contact_id)
        )).scalar_one_or_none()
        if not pc:
            return JSONResponse({"detail": "not found"}, status_code=404)
        await session.delete(pc)
        await session.commit()
        await _write_audit(session, tenant_id, user_id, "payer_contact.delete", "payer_contact", contact_id, {})
        return {"deleted": True}


# ---------------------------------------------------------------------------
# Appeal Letter History (versions)
# ---------------------------------------------------------------------------

@app.get("/api/v1/claims/{claim_id}/letter-history")
async def letter_history(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        appeals = (await session.execute(
            select(Appeal)
            .where(Appeal.tenant_id == tenant_id, Appeal.claim_id == claim_id)
            .order_by(Appeal.version.asc())
        )).scalars().all()
        return [
            {
                "appeal_id": a.id,
                "version": a.version,
                "letter_text": a.letter_text,
                "confidence": a.confidence,
                "needs_review": a.needs_review,
                "approved_by": a.approved_by,
                "approved_at": a.approved_at.isoformat() if a.approved_at else None,
                "created_at": a.created_at.isoformat(),
            }
            for a in appeals
        ]


# ---------------------------------------------------------------------------
# Claim Cost Tracker
# ---------------------------------------------------------------------------

COST_CATEGORIES = ["staff_time", "filing_fee", "legal", "copying", "postage", "other"]


@app.get("/api/v1/claims/{claim_id}/costs")
async def list_claim_costs(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(ClaimCost)
            .where(ClaimCost.tenant_id == tenant_id, ClaimCost.claim_id == claim_id)
            .order_by(ClaimCost.created_at.desc())
        )).scalars().all()
        total = sum(c.amount_cents for c in rows)
        return {
            "claim_id": claim_id,
            "total_cents": total,
            "items": [
                {
                    "id": c.id,
                    "category": c.category,
                    "description": c.description,
                    "amount_cents": c.amount_cents,
                    "recorded_by": c.recorded_by,
                    "recorded_by_name": TEAM_MEMBERS.get(c.recorded_by, c.recorded_by),
                    "created_at": c.created_at.isoformat(),
                }
                for c in rows
            ],
        }


@app.post("/api/v1/claims/{claim_id}/costs", status_code=201)
async def add_claim_cost(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()

    category = body.get("category", "")
    if category not in COST_CATEGORIES:
        return JSONResponse({"detail": f"category must be one of {COST_CATEGORIES}"}, status_code=400)
    desc = (body.get("description") or "").strip()
    amount = body.get("amount_cents", 0)
    if not isinstance(amount, int) or amount <= 0:
        return JSONResponse({"detail": "amount_cents must be a positive integer"}, status_code=400)

    async with request.app.state.session_factory() as session:
        cost = ClaimCost(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id=claim_id,
            category=category,
            description=desc or category,
            amount_cents=amount,
            recorded_by=user_id,
        )
        session.add(cost)
        await session.commit()
        await _write_audit(session, tenant_id, user_id, "claim_cost.create", "claim", claim_id,
                           {"cost_id": cost.id, "category": category, "amount_cents": amount})
        return {"id": cost.id, "category": category, "amount_cents": amount}


@app.get("/api/v1/analytics/cost-summary")
async def cost_summary(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        costs = (await session.execute(
            select(ClaimCost).where(ClaimCost.tenant_id == tenant_id)
        )).scalars().all()

    by_category: dict[str, int] = {}
    by_claim: dict[str, int] = {}
    total = 0
    for c in costs:
        by_category[c.category] = by_category.get(c.category, 0) + c.amount_cents
        by_claim[c.claim_id] = by_claim.get(c.claim_id, 0) + c.amount_cents
        total += c.amount_cents

    return {
        "total_cents": total,
        "total_entries": len(costs),
        "by_category": [{"category": k, "total_cents": v} for k, v in sorted(by_category.items(), key=lambda x: -x[1])],
        "claims_with_costs": len(by_claim),
    }


# ---------------------------------------------------------------------------
# Claim Snapshot / Print View
# ---------------------------------------------------------------------------

@app.get("/api/v1/claims/{claim_id}/snapshot")
async def claim_snapshot(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claim = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id, Claim.id == claim_id)
        )).scalar_one_or_none()
        if not claim:
            return JSONResponse({"detail": "not found"}, status_code=404)

        notes = (await session.execute(
            select(ClaimNote).where(ClaimNote.tenant_id == tenant_id, ClaimNote.claim_id == claim_id)
            .order_by(ClaimNote.created_at.asc())
        )).scalars().all()

        appeals = (await session.execute(
            select(Appeal).where(Appeal.tenant_id == tenant_id, Appeal.claim_id == claim_id)
            .order_by(Appeal.version.asc())
        )).scalars().all()

        tags = (await session.execute(
            select(ClaimTag).where(ClaimTag.tenant_id == tenant_id, ClaimTag.claim_id == claim_id)
        )).scalars().all()

        costs = (await session.execute(
            select(ClaimCost).where(ClaimCost.tenant_id == tenant_id, ClaimCost.claim_id == claim_id)
        )).scalars().all()

        return {
            "claim": {
                "id": claim.id,
                "claim_number": claim.claim_number,
                "payer_name": claim.payer_name,
                "denial_code": claim.denial_code,
                "denial_reason": claim.denial_reason,
                "status": claim.status,
                "amount_denied_cents": claim.amount_denied_cents,
                "amount_approved_cents": claim.amount_approved_cents,
                "filing_deadline": claim.filing_deadline.isoformat() if claim.filing_deadline else None,
                "created_at": claim.created_at.isoformat(),
            },
            "notes": [{"author": TEAM_MEMBERS.get(n.author_id, n.author_id), "content": n.content,
                        "created_at": n.created_at.isoformat()} for n in notes],
            "appeals": [{"version": a.version, "confidence": a.confidence, "needs_review": a.needs_review,
                         "approved_by": a.approved_by, "created_at": a.created_at.isoformat()} for a in appeals],
            "tags": [t.tag for t in tags],
            "total_cost_cents": sum(c.amount_cents for c in costs),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


# ---------------------------------------------------------------------------
# Denial Prevention Tips
# ---------------------------------------------------------------------------

PREVENTION_TIPS: dict[str, list[str]] = {
    "CO-16": [
        "Verify patient eligibility before scheduling services",
        "Confirm insurance coverage and policy status at check-in",
        "Document all eligibility verification attempts",
    ],
    "CO-4": [
        "Use modifier codes correctly per payer guidelines",
        "Review bundling rules before submitting procedure codes",
        "Check NCCI edits for code pair conflicts",
    ],
    "CO-97": [
        "Check benefit period limits before authorizing treatment",
        "Track patient utilization against plan maximums",
        "Request pre-authorization for services near plan limits",
    ],
    "CO-29": [
        "Verify timely filing deadlines per payer contract",
        "Implement automated filing deadline alerts",
        "Submit claims within 48 hours of service date",
    ],
    "PR-1": [
        "Collect patient copay/coinsurance at time of service",
        "Verify patient financial responsibility before treatment",
        "Provide upfront cost estimates using payer fee schedules",
    ],
    "CO-197": [
        "Obtain prior authorization before rendering services",
        "Track authorization expiration dates",
        "Verify authorization covers the specific CPT codes billed",
    ],
}

DEFAULT_TIPS = [
    "Review denial patterns monthly to identify systemic issues",
    "Train staff on top denial reasons and prevention strategies",
    "Implement pre-claim scrubbing to catch errors before submission",
]


@app.get("/api/v1/denial-prevention-tips")
async def denial_prevention_tips(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim.denial_code, func.count(Claim.id).label("cnt"))
            .where(Claim.tenant_id == tenant_id)
            .group_by(Claim.denial_code)
            .order_by(func.count(Claim.id).desc())
        )).all()

    result = []
    for code, count in claims:
        if not code:
            continue
        tips = PREVENTION_TIPS.get(code, DEFAULT_TIPS)
        result.append({
            "denial_code": code,
            "occurrence_count": count,
            "tips": tips,
            "source": "CMS/AMA guidelines" if code in PREVENTION_TIPS else "general best practice",
        })
    return result


# ---------------------------------------------------------------------------
# User Activity Log (personal)
# ---------------------------------------------------------------------------

@app.get("/api/v1/my-activity")
async def my_activity(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    limit = int(request.query_params.get("limit", "50"))
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(AuditLog)
            .where(AuditLog.tenant_id == tenant_id, AuditLog.actor_id == user_id)
            .order_by(AuditLog.created_at.desc())
            .limit(min(limit, 200))
        )).scalars().all()
        return [
            {
                "id": a.id,
                "action": a.action,
                "resource_type": a.resource_type,
                "resource_id": a.resource_id,
                "created_at": a.created_at.isoformat(),
            }
            for a in rows
        ]


# ---------------------------------------------------------------------------
# Claim Links / Dependencies
# ---------------------------------------------------------------------------

LINK_TYPES = ["related", "duplicate", "parent", "child", "follow_up", "rebill"]


@app.get("/api/v1/claims/{claim_id}/links")
async def list_claim_links(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(ClaimLink).where(
                ClaimLink.tenant_id == tenant_id,
                (ClaimLink.claim_id_a == claim_id) | (ClaimLink.claim_id_b == claim_id),
            )
        )).scalars().all()

        linked_ids = set()
        for r in rows:
            linked_ids.add(r.claim_id_a)
            linked_ids.add(r.claim_id_b)
        linked_ids.discard(claim_id)

        claims_map: dict[str, Claim] = {}
        if linked_ids:
            linked_claims = (await session.execute(
                select(Claim).where(Claim.tenant_id == tenant_id, Claim.id.in_(linked_ids))
            )).scalars().all()
            claims_map = {c.id: c for c in linked_claims}

        result = []
        for r in rows:
            other_id = r.claim_id_b if r.claim_id_a == claim_id else r.claim_id_a
            other = claims_map.get(other_id)
            result.append({
                "link_id": r.id,
                "link_type": r.link_type,
                "other_claim_id": other_id,
                "other_claim_number": other.claim_number if other else None,
                "other_status": other.status if other else None,
                "other_payer": other.payer_name if other else None,
                "created_by": r.created_by,
                "created_at": r.created_at.isoformat(),
            })
        return result


@app.post("/api/v1/claims/{claim_id}/links", status_code=201)
async def create_claim_link(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()
    other_id = body.get("other_claim_id", "")
    link_type = body.get("link_type", "related")
    if not other_id:
        return JSONResponse({"detail": "other_claim_id required"}, status_code=400)
    if link_type not in LINK_TYPES:
        return JSONResponse({"detail": f"link_type must be one of {LINK_TYPES}"}, status_code=400)

    async with request.app.state.session_factory() as session:
        link = ClaimLink(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            claim_id_a=claim_id,
            claim_id_b=other_id,
            link_type=link_type,
            created_by=user_id,
        )
        session.add(link)
        await session.commit()
        await _write_audit(session, tenant_id, user_id, "claim_link.create", "claim", claim_id,
                           {"other_claim_id": other_id, "link_type": link_type})
        return {"id": link.id, "link_type": link_type, "claim_id_a": claim_id, "claim_id_b": other_id}


@app.delete("/api/v1/claim-links/{link_id}")
async def delete_claim_link(link_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        link = (await session.execute(
            select(ClaimLink).where(ClaimLink.tenant_id == tenant_id, ClaimLink.id == link_id)
        )).scalar_one_or_none()
        if not link:
            return JSONResponse({"detail": "not found"}, status_code=404)
        await session.delete(link)
        await session.commit()
        await _write_audit(session, tenant_id, user_id, "claim_link.delete", "claim_link", link_id, {})
        return {"deleted": True}


# ---------------------------------------------------------------------------
# Dashboard Bookmarks
# ---------------------------------------------------------------------------

@app.get("/api/v1/bookmarks")
async def list_bookmarks(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(DashboardBookmark)
            .where(DashboardBookmark.tenant_id == tenant_id, DashboardBookmark.user_id == user_id)
            .order_by(DashboardBookmark.created_at.asc())
        )).scalars().all()
        return [
            {
                "id": b.id,
                "label": b.label,
                "path": b.path,
                "icon": b.icon,
                "created_at": b.created_at.isoformat(),
            }
            for b in rows
        ]


@app.post("/api/v1/bookmarks", status_code=201)
async def create_bookmark(request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    body = await request.json()
    label = (body.get("label") or "").strip()
    path = (body.get("path") or "").strip()
    if not label or not path:
        return JSONResponse({"detail": "label and path required"}, status_code=400)

    async with request.app.state.session_factory() as session:
        bm = DashboardBookmark(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            user_id=user_id,
            label=label,
            path=path,
            icon=body.get("icon"),
        )
        session.add(bm)
        await session.commit()
        return {"id": bm.id, "label": label, "path": path}


@app.delete("/api/v1/bookmarks/{bookmark_id}")
async def delete_bookmark(bookmark_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    async with request.app.state.session_factory() as session:
        bm = (await session.execute(
            select(DashboardBookmark).where(
                DashboardBookmark.tenant_id == tenant_id,
                DashboardBookmark.id == bookmark_id,
                DashboardBookmark.user_id == user_id,
            )
        )).scalar_one_or_none()
        if not bm:
            return JSONResponse({"detail": "not found"}, status_code=404)
        await session.delete(bm)
        await session.commit()
        return {"deleted": True}


# ---------------------------------------------------------------------------
# Payer SLA Tracker
# ---------------------------------------------------------------------------

@app.get("/api/v1/analytics/payer-sla")
async def payer_sla(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()
        responses = (await session.execute(
            select(PayerResponse).where(PayerResponse.tenant_id == tenant_id)
        )).scalars().all()

    response_map: dict[str, datetime] = {}
    for r in responses:
        if r.claim_id not in response_map or r.received_at < response_map[r.claim_id]:
            response_map[r.claim_id] = r.received_at

    by_payer: dict[str, dict] = {}
    for c in claims:
        payer = c.payer_name or "Unknown"
        if payer not in by_payer:
            by_payer[payer] = {
                "total": 0,
                "responded": 0,
                "response_days": [],
                "sla_target_days": PAYER_DEADLINES_DAYS.get(payer, 45),
                "within_sla": 0,
                "overdue": 0,
            }
        b = by_payer[payer]
        b["total"] += 1

        if c.id in response_map:
            b["responded"] += 1
            days = (response_map[c.id] - c.created_at).days
            b["response_days"].append(days)
            if days <= b["sla_target_days"]:
                b["within_sla"] += 1
            else:
                b["overdue"] += 1

    result = []
    for payer, data in sorted(by_payer.items()):
        avg_days = round(sum(data["response_days"]) / len(data["response_days"]), 1) if data["response_days"] else None
        sla_rate = round(data["within_sla"] / data["responded"] * 100, 1) if data["responded"] > 0 else None
        result.append({
            "payer": payer,
            "total_claims": data["total"],
            "responded": data["responded"],
            "avg_response_days": avg_days,
            "sla_target_days": data["sla_target_days"],
            "within_sla": data["within_sla"],
            "overdue": data["overdue"],
            "sla_compliance_rate": sla_rate,
        })
    result.sort(key=lambda x: x["total_claims"], reverse=True)
    return result


# ── Claim Timeline ──────────────────────────────────────────────────────

@app.get("/api/v1/claims/{claim_id}/timeline")
async def claim_timeline(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claim = (await session.execute(
            select(Claim).where(Claim.id == claim_id, Claim.tenant_id == tenant_id)
        )).scalar_one_or_none()
        if not claim:
            return JSONResponse({"detail": "not found"}, 404)

        events: list[dict] = []

        events.append({
            "type": "claim_created",
            "timestamp": claim.created_at.isoformat(),
            "detail": f"Claim {claim.claim_number or claim.id[:8]} created",
        })

        notes = (await session.execute(
            select(ClaimNote).where(ClaimNote.claim_id == claim_id, ClaimNote.tenant_id == tenant_id)
        )).scalars().all()
        for n in notes:
            events.append({
                "type": "note",
                "timestamp": n.created_at.isoformat(),
                "detail": n.content[:120],
                "actor": TEAM_MEMBERS.get(n.author_id, n.author_id),
            })

        comments = (await session.execute(
            select(ClaimComment).where(ClaimComment.claim_id == claim_id, ClaimComment.tenant_id == tenant_id)
        )).scalars().all()
        for c in comments:
            events.append({
                "type": "comment",
                "timestamp": c.created_at.isoformat(),
                "detail": c.body[:120],
                "actor": TEAM_MEMBERS.get(c.author_id, c.author_id),
            })

        appeals = (await session.execute(
            select(Appeal).where(Appeal.claim_id == claim_id, Appeal.tenant_id == tenant_id)
        )).scalars().all()
        for a in appeals:
            events.append({
                "type": "appeal_created",
                "timestamp": a.created_at.isoformat(),
                "detail": f"Appeal v{a.version} drafted (confidence: {a.confidence})",
            })
            if a.approved_at:
                events.append({
                    "type": "appeal_approved",
                    "timestamp": a.approved_at.isoformat(),
                    "detail": f"Appeal v{a.version} approved",
                    "actor": TEAM_MEMBERS.get(a.approved_by or "", a.approved_by),
                })

        costs = (await session.execute(
            select(ClaimCost).where(ClaimCost.claim_id == claim_id, ClaimCost.tenant_id == tenant_id)
        )).scalars().all()
        for co in costs:
            events.append({
                "type": "cost",
                "timestamp": co.created_at.isoformat(),
                "detail": f"{co.category}: ${co.amount_cents / 100:.2f} — {co.description[:80]}",
                "actor": TEAM_MEMBERS.get(co.recorded_by, co.recorded_by),
            })

        responses = (await session.execute(
            select(PayerResponse).where(PayerResponse.claim_id == claim_id, PayerResponse.tenant_id == tenant_id)
        )).scalars().all()
        for r in responses:
            events.append({
                "type": "payer_response",
                "timestamp": r.received_at.isoformat(),
                "detail": f"{r.response_type}: {r.response_text[:80] if r.response_text else '—'}",
            })

        assignments = (await session.execute(
            select(ClaimAssignment).where(ClaimAssignment.claim_id == claim_id, ClaimAssignment.tenant_id == tenant_id)
        )).scalars().all()
        for a in assignments:
            events.append({
                "type": "assignment",
                "timestamp": a.created_at.isoformat(),
                "detail": f"Assigned to {TEAM_MEMBERS.get(a.assigned_to, a.assigned_to)}",
                "actor": TEAM_MEMBERS.get(a.assigned_by, a.assigned_by),
            })

        events.sort(key=lambda e: e["timestamp"])
    return events


# ── Bulk Tag Manager ────────────────────────────────────────────────────

class BulkTagRequest(BaseModel):
    claim_ids: list[str]
    tag: str

@app.post("/api/v1/tags/bulk-add")
async def bulk_add_tag(body: BulkTagRequest, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    added = 0
    async with request.app.state.session_factory() as session:
        for cid in body.claim_ids:
            existing = (await session.execute(
                select(ClaimTag).where(
                    ClaimTag.claim_id == cid,
                    ClaimTag.tenant_id == tenant_id,
                    ClaimTag.tag == body.tag,
                )
            )).scalar_one_or_none()
            if not existing:
                session.add(ClaimTag(
                    tenant_id=tenant_id,
                    claim_id=cid,
                    tag=body.tag,
                    created_by=user_id,
                ))
                added += 1
        await session.commit()
        await _write_audit(session, tenant_id, user_id, "tag.bulk_add", "claim_tag", body.tag, {"claim_count": len(body.claim_ids), "tag": body.tag})
    return {"added": added, "tag": body.tag, "claim_count": len(body.claim_ids)}


@app.post("/api/v1/tags/bulk-remove")
async def bulk_remove_tag(body: BulkTagRequest, request: Request):
    tenant_id = _get_tenant_id(request)
    user_id = _get_user_id(request)
    removed = 0
    async with request.app.state.session_factory() as session:
        for cid in body.claim_ids:
            tag_row = (await session.execute(
                select(ClaimTag).where(
                    ClaimTag.claim_id == cid,
                    ClaimTag.tenant_id == tenant_id,
                    ClaimTag.tag == body.tag,
                )
            )).scalar_one_or_none()
            if tag_row:
                await session.delete(tag_row)
                removed += 1
        await session.commit()
        await _write_audit(session, tenant_id, user_id, "tag.bulk_remove", "claim_tag", body.tag, {"claim_count": len(body.claim_ids), "tag": body.tag})
    return {"removed": removed, "tag": body.tag, "claim_count": len(body.claim_ids)}


@app.get("/api/v1/tags/summary")
async def tag_summary(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(ClaimTag.tag, func.count(ClaimTag.id).label("count"))
            .where(ClaimTag.tenant_id == tenant_id)
            .group_by(ClaimTag.tag)
            .order_by(func.count(ClaimTag.id).desc())
        )).all()
    return [{"tag": r.tag, "count": r.count} for r in rows]


# ── User Workload Summary ──────────────────────────────────────────────

@app.get("/api/v1/analytics/workload")
async def workload_summary(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        assignments = (await session.execute(
            select(ClaimAssignment).where(ClaimAssignment.tenant_id == tenant_id)
        )).scalars().all()

        claims_by_id: dict[str, Claim] = {}
        if assignments:
            claim_ids = list({a.claim_id for a in assignments})
            claims_list = (await session.execute(
                select(Claim).where(Claim.id.in_(claim_ids))
            )).scalars().all()
            claims_by_id = {c.id: c for c in claims_list}

    latest: dict[str, str] = {}
    for a in sorted(assignments, key=lambda x: x.created_at):
        latest[a.claim_id] = a.assigned_to

    by_user: dict[str, dict] = {}
    for claim_id, user_id in latest.items():
        claim = claims_by_id.get(claim_id)
        if not claim:
            continue
        if user_id not in by_user:
            by_user[user_id] = {
                "user_id": user_id,
                "user_name": TEAM_MEMBERS.get(user_id, user_id),
                "total": 0,
                "active": 0,
                "pending_review": 0,
                "total_value_cents": 0,
            }
        u = by_user[user_id]
        u["total"] += 1
        if claim.status in ("pending_review", "in_progress", "needs_review", "approved"):
            u["active"] += 1
        if claim.status == "pending_review":
            u["pending_review"] += 1
        u["total_value_cents"] += claim.amount_denied_cents or 0

    result = sorted(by_user.values(), key=lambda x: x["active"], reverse=True)
    return result


# ── Appeal Version Comparison ───────────────────────────────────────────

@app.get("/api/v1/claims/{claim_id}/appeal-versions")
async def appeal_versions(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        appeals = (await session.execute(
            select(Appeal).where(
                Appeal.claim_id == claim_id,
                Appeal.tenant_id == tenant_id,
            ).order_by(Appeal.version)
        )).scalars().all()

    return [
        {
            "id": a.id,
            "version": a.version,
            "letter_text": a.letter_text,
            "policy_evidence": a.policy_evidence,
            "confidence": a.confidence,
            "needs_review": a.needs_review,
            "approved_by": TEAM_MEMBERS.get(a.approved_by or "", a.approved_by) if a.approved_by else None,
            "approved_at": a.approved_at.isoformat() if a.approved_at else None,
            "created_at": a.created_at.isoformat(),
        }
        for a in appeals
    ]


# ── Payer Intelligence ──────────────────────────────────────────────────

@app.get("/api/v1/analytics/payer-intelligence")
async def payer_intelligence(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()

        responses = (await session.execute(
            select(PayerResponse).where(PayerResponse.tenant_id == tenant_id)
        )).scalars().all()

        contacts = (await session.execute(
            select(PayerContact).where(PayerContact.tenant_id == tenant_id)
        )).scalars().all()

    response_map: dict[str, list] = {}
    for r in responses:
        response_map.setdefault(r.claim_id, []).append(r)

    contacts_by_payer: dict[str, list] = {}
    for c in contacts:
        contacts_by_payer.setdefault(c.payer_name, []).append({
            "name": c.contact_name,
            "phone": c.phone,
            "email": c.email,
            "department": c.department,
        })

    by_payer: dict[str, dict] = {}
    for c in claims:
        payer = c.payer_name or "Unknown"
        if payer not in by_payer:
            by_payer[payer] = {
                "payer": payer,
                "total_claims": 0,
                "won": 0,
                "lost": 0,
                "pending": 0,
                "total_denied_cents": 0,
                "total_recovered_cents": 0,
                "denial_codes": {},
                "avg_response_days": None,
                "response_days_list": [],
            }
        p = by_payer[payer]
        p["total_claims"] += 1
        p["total_denied_cents"] += c.amount_denied_cents or 0

        if c.status == "won":
            p["won"] += 1
            p["total_recovered_cents"] += c.amount_approved_cents or 0
        elif c.status == "lost":
            p["lost"] += 1
        else:
            p["pending"] += 1

        code = c.denial_code or "Unknown"
        p["denial_codes"][code] = p["denial_codes"].get(code, 0) + 1

        if c.id in response_map:
            for resp in response_map[c.id]:
                ca = c.created_at.replace(tzinfo=None) if c.created_at.tzinfo else c.created_at
                ra = resp.received_at.replace(tzinfo=None) if resp.received_at.tzinfo else resp.received_at
                days = (ra - ca).days
                p["response_days_list"].append(days)

    result = []
    for payer, data in sorted(by_payer.items()):
        win_rate = round(data["won"] / (data["won"] + data["lost"]) * 100, 1) if (data["won"] + data["lost"]) > 0 else None
        avg_days = round(sum(data["response_days_list"]) / len(data["response_days_list"]), 1) if data["response_days_list"] else None
        top_codes = sorted(data["denial_codes"].items(), key=lambda x: x[1], reverse=True)[:5]
        result.append({
            "payer": payer,
            "total_claims": data["total_claims"],
            "won": data["won"],
            "lost": data["lost"],
            "pending": data["pending"],
            "win_rate": win_rate,
            "total_denied_cents": data["total_denied_cents"],
            "total_recovered_cents": data["total_recovered_cents"],
            "avg_response_days": avg_days,
            "top_denial_codes": [{"code": c, "count": n} for c, n in top_codes],
            "contacts": contacts_by_payer.get(payer, []),
            "deadline_days": PAYER_DEADLINES_DAYS.get(payer, 90),
        })
    result.sort(key=lambda x: x["total_claims"], reverse=True)
    return result


# ── Claim Status Distribution ───────────────────────────────────────────

@app.get("/api/v1/analytics/status-distribution")
async def status_distribution(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(Claim.status, func.count(Claim.id).label("count"))
            .where(Claim.tenant_id == tenant_id)
            .group_by(Claim.status)
        )).all()
    return [{"status": r.status, "count": r.count} for r in rows]


# ── Revenue Recovery Tracker ────────────────────────────────────────────

@app.get("/api/v1/analytics/recovery")
async def revenue_recovery(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()

    total_denied = sum(c.amount_denied_cents or 0 for c in claims)
    total_recovered = sum(c.amount_approved_cents or 0 for c in claims if c.status == "won")
    total_pending = sum(c.amount_denied_cents or 0 for c in claims if c.status in ("pending_review", "in_progress", "needs_review", "approved", "sent"))
    total_lost = sum(c.amount_denied_cents or 0 for c in claims if c.status == "lost")
    won_count = sum(1 for c in claims if c.status == "won")
    lost_count = sum(1 for c in claims if c.status == "lost")
    recovery_rate = round(total_recovered / total_denied * 100, 1) if total_denied > 0 else 0

    by_payer: dict[str, dict] = {}
    for c in claims:
        payer = c.payer_name or "Unknown"
        if payer not in by_payer:
            by_payer[payer] = {"payer": payer, "denied_cents": 0, "recovered_cents": 0}
        by_payer[payer]["denied_cents"] += c.amount_denied_cents or 0
        if c.status == "won":
            by_payer[payer]["recovered_cents"] += c.amount_approved_cents or 0

    return {
        "total_denied_cents": total_denied,
        "total_recovered_cents": total_recovered,
        "total_pending_cents": total_pending,
        "total_lost_cents": total_lost,
        "won_count": won_count,
        "lost_count": lost_count,
        "recovery_rate": recovery_rate,
        "by_payer": sorted(by_payer.values(), key=lambda x: x["denied_cents"], reverse=True),
    }


# ── Per-Claim Audit Trail ──────────────────────────────────────────────

@app.get("/api/v1/claims/{claim_id}/audit-trail")
async def claim_audit_trail(claim_id: str, request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        rows = (await session.execute(
            select(AuditLog).where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.resource_id == claim_id,
            ).order_by(AuditLog.created_at.desc())
        )).scalars().all()

    return [
        {
            "id": r.id,
            "action": r.action,
            "actor": TEAM_MEMBERS.get(r.actor_id, r.actor_id),
            "actor_id": r.actor_id,
            "detail": r.detail,
            "hash": r.hash[:12],
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ── Team Performance ────────────────────────────────────────────────────

@app.get("/api/v1/analytics/team-performance")
async def team_performance(request: Request):
    tenant_id = _get_tenant_id(request)
    async with request.app.state.session_factory() as session:
        claims = (await session.execute(
            select(Claim).where(Claim.tenant_id == tenant_id)
        )).scalars().all()

        assignments = (await session.execute(
            select(ClaimAssignment).where(ClaimAssignment.tenant_id == tenant_id)
        )).scalars().all()

        audit_rows = (await session.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        )).scalars().all()

    claims_by_id = {c.id: c for c in claims}

    latest_assignment: dict[str, str] = {}
    for a in sorted(assignments, key=lambda x: x.created_at):
        latest_assignment[a.claim_id] = a.assigned_to

    actions_by_user: dict[str, int] = {}
    for a in audit_rows:
        actions_by_user[a.actor_id] = actions_by_user.get(a.actor_id, 0) + 1

    by_user: dict[str, dict] = {}
    for claim_id, user_id in latest_assignment.items():
        claim = claims_by_id.get(claim_id)
        if not claim:
            continue
        if user_id not in by_user:
            by_user[user_id] = {
                "user_id": user_id,
                "user_name": TEAM_MEMBERS.get(user_id, user_id),
                "claims_assigned": 0,
                "won": 0,
                "lost": 0,
                "pending": 0,
                "recovered_cents": 0,
                "actions": actions_by_user.get(user_id, 0),
            }
        u = by_user[user_id]
        u["claims_assigned"] += 1
        if claim.status == "won":
            u["won"] += 1
            u["recovered_cents"] += claim.amount_approved_cents or 0
        elif claim.status == "lost":
            u["lost"] += 1
        else:
            u["pending"] += 1

    result = []
    for user_id in TEAM_MEMBERS:
        if user_id in by_user:
            u = by_user[user_id]
        else:
            u = {
                "user_id": user_id,
                "user_name": TEAM_MEMBERS[user_id],
                "claims_assigned": 0,
                "won": 0,
                "lost": 0,
                "pending": 0,
                "recovered_cents": 0,
                "actions": actions_by_user.get(user_id, 0),
            }
        u["win_rate"] = round(u["won"] / (u["won"] + u["lost"]) * 100, 1) if (u["won"] + u["lost"]) > 0 else None
        result.append(u)

    result.sort(key=lambda x: x["claims_assigned"], reverse=True)
    return result


# ── Denial Code Reference ──────────────────────────────────────────────

DENIAL_CODE_REFERENCE = {
    "CO-4": {"code": "CO-4", "name": "Procedure code inconsistent with modifier", "category": "coding",
             "description": "The procedure code is inconsistent with the modifier used, or a required modifier is missing.",
             "common_causes": ["Missing modifier", "Incorrect modifier", "Unbundling issues"],
             "resolution_steps": ["Review modifier requirements", "Check NCCI edits", "Verify pairing"], "source": "CMS CARC/RARC"},
    "CO-16": {"code": "CO-16", "name": "Claim lacks information for adjudication", "category": "documentation",
              "description": "Missing or invalid information needed to adjudicate the claim.",
              "common_causes": ["Missing diagnosis code", "Incomplete patient info", "Missing referring provider"],
              "resolution_steps": ["Review for completeness", "Add missing data", "Resubmit"], "source": "CMS CARC/RARC"},
    "CO-29": {"code": "CO-29", "name": "Time limit for filing expired", "category": "timely_filing",
              "description": "The time limit for filing has passed per payer requirements.",
              "common_causes": ["Late submission", "Delayed secondary filing", "Past deadline"],
              "resolution_steps": ["Check original date", "File proof of timely filing", "Request exception"], "source": "CMS CARC/RARC"},
    "CO-50": {"code": "CO-50", "name": "Non-covered service", "category": "coverage",
              "description": "Service not covered under patient's benefit plan.",
              "common_causes": ["Service exclusion", "Plan limitation", "Experimental designation"],
              "resolution_steps": ["Verify benefits", "Request medical necessity review", "Provide documentation"], "source": "CMS CARC/RARC"},
    "CO-97": {"code": "CO-97", "name": "Benefit included in another service", "category": "bundling",
              "description": "Payment included in allowance for another adjudicated service.",
              "common_causes": ["Bundled procedure", "NCCI edit pair", "Global service"],
              "resolution_steps": ["Check NCCI edits", "Use modifier 59 if distinct", "Review global period"], "source": "CMS CARC/RARC"},
    "CO-197": {"code": "CO-197", "name": "Precertification absent", "category": "authorization",
               "description": "Prior authorization was not obtained before service.",
               "common_causes": ["No prior auth", "Auth expired", "Wrong auth number"],
               "resolution_steps": ["Obtain retroactive auth", "Submit auth number", "Appeal with justification"], "source": "CMS CARC/RARC"},
    "PR-1": {"code": "PR-1", "name": "Deductible amount", "category": "patient_responsibility",
             "description": "Amount applied to patient deductible.",
             "common_causes": ["Deductible not met", "Beginning of benefit year", "High-deductible plan"],
             "resolution_steps": ["Verify deductible status", "Bill patient", "Check COB"], "source": "CMS CARC/RARC"},
    "PR-2": {"code": "PR-2", "name": "Coinsurance amount", "category": "patient_responsibility",
             "description": "Patient coinsurance responsibility.",
             "common_causes": ["Standard coinsurance", "Out-of-network", "Plan design"],
             "resolution_steps": ["Bill patient", "Verify in-network status"], "source": "CMS CARC/RARC"},
    "PR-3": {"code": "PR-3", "name": "Co-payment amount", "category": "patient_responsibility",
             "description": "Patient copayment amount for this service.",
             "common_causes": ["Office visit copay", "Specialist copay", "ER copay"],
             "resolution_steps": ["Collect copay", "Verify copay amount"], "source": "CMS CARC/RARC"},
}


@app.get("/api/v1/denial-code-reference")
async def denial_code_reference(q: str = Query(default="")):
    if not q:
        return list(DENIAL_CODE_REFERENCE.values())
    q_lower = q.lower()
    return [
        v for v in DENIAL_CODE_REFERENCE.values()
        if q_lower in v["code"].lower() or q_lower in v["name"].lower() or q_lower in v["category"].lower()
    ]


# ── Quick Stats ─────────────────────────────────────────────────────────

@app.get("/api/v1/analytics/quick-stats")
async def quick_stats(request: Request):
    tenant_id = _get_tenant_id(request)
    now = datetime.utcnow()
    async with request.app.state.session_factory() as session:
        total_claims = (await session.execute(
            select(func.count(Claim.id)).where(Claim.tenant_id == tenant_id)
        )).scalar() or 0
        active_claims = (await session.execute(
            select(func.count(Claim.id)).where(Claim.tenant_id == tenant_id, Claim.status.in_(["pending_review", "in_progress", "needs_review", "approved", "sent"]))
        )).scalar() or 0
        won_claims = (await session.execute(
            select(func.count(Claim.id)).where(Claim.tenant_id == tenant_id, Claim.status == "won")
        )).scalar() or 0
        total_denied = (await session.execute(
            select(func.sum(Claim.amount_denied_cents)).where(Claim.tenant_id == tenant_id)
        )).scalar() or 0
        total_recovered = (await session.execute(
            select(func.sum(Claim.amount_approved_cents)).where(Claim.tenant_id == tenant_id, Claim.status == "won")
        )).scalar() or 0
        overdue = (await session.execute(
            select(func.count(Claim.id)).where(Claim.tenant_id == tenant_id, Claim.filing_deadline < now, Claim.status.in_(["pending_review", "in_progress", "needs_review"]))
        )).scalar() or 0
        pending_appeals = (await session.execute(
            select(func.count(Appeal.id)).where(Appeal.tenant_id == tenant_id, Appeal.needs_review == True, Appeal.approved_at == None)
        )).scalar() or 0

    return {
        "total_claims": total_claims, "active_claims": active_claims, "won_claims": won_claims,
        "total_denied_cents": total_denied, "total_recovered_cents": total_recovered,
        "recovery_rate": round(total_recovered / total_denied * 100, 1) if total_denied > 0 else 0,
        "overdue_claims": overdue, "pending_appeals": pending_appeals,
    }
