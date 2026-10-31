"""Appeals service — draft, approve (server-enforced), send."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query
from sqlalchemy import func, select

from claimshield_common.auth import CurrentUser, Role, require_role
from claimshield_common.db import create_engine, create_session_factory
from claimshield_common.events import CloudEvent, OutboxEntry
from claimshield_common.models import Appeal, Claim
from claimshield_common.problem import problem_response
from claimshield_common.tenancy import bind_tenant_to_session, set_current_tenant

from .schemas import AppealApprove, AppealCreate, AppealResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_engine()
    app.state.session_factory = create_session_factory(engine)
    yield
    await engine.dispose()


app = FastAPI(title="ClaimShield Appeals Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


def _session(app_instance: FastAPI):
    sf = app_instance.state.session_factory
    session = sf()
    bind_tenant_to_session(session)
    return session


@app.post("/api/v1/appeals", response_model=AppealResponse, status_code=201)
async def create_appeal(body: AppealCreate, user: CurrentUser):
    """Create a draft appeal for a claim. Always starts with needs_review=True."""
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        claim = await session.get(Claim, body.claim_id)
        if not claim:
            return problem_response(404, "Not Found", detail=f"Claim {body.claim_id} not found")

        # Get next version number
        result = await session.execute(
            select(func.coalesce(func.max(Appeal.version), 0))
            .where(Appeal.claim_id == body.claim_id)
        )
        next_version = result.scalar_one() + 1

        appeal = Appeal(
            tenant_id=user.tenant_id,
            claim_id=body.claim_id,
            version=next_version,
            letter_text=body.letter_text,
            policy_evidence=body.policy_evidence,
            confidence=body.confidence,
            needs_review=True,  # always starts needing review
        )
        session.add(appeal)

        event = CloudEvent(
            source="appeals-svc",
            type="appeal.drafted.v1",
            subject=str(appeal.id),
            tenantid=str(user.tenant_id),
            data={
                "appeal_id": str(appeal.id),
                "claim_id": str(body.claim_id),
                "version": next_version,
                "confidence": body.confidence,
            },
        )
        outbox = OutboxEntry(
            aggregatetype="appeal",
            aggregateid=str(appeal.id),
            type="appeal.drafted.v1",
            payload=event.model_dump_json(),
        )
        session.add(outbox)
        await session.commit()
        await session.refresh(appeal)
        return appeal


@app.get("/api/v1/appeals", response_model=list[AppealResponse])
async def list_appeals(
    user: CurrentUser,
    claim_id: UUID | None = None,
    needs_review: bool | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        q = select(Appeal).order_by(Appeal.created_at.desc()).limit(limit).offset(offset)
        if claim_id:
            q = q.where(Appeal.claim_id == claim_id)
        if needs_review is not None:
            q = q.where(Appeal.needs_review == needs_review)
        result = await session.execute(q)
        return result.scalars().all()


@app.get("/api/v1/appeals/{appeal_id}", response_model=AppealResponse)
async def get_appeal(appeal_id: UUID, user: CurrentUser):
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        appeal = await session.get(Appeal, appeal_id)
        if not appeal:
            return problem_response(404, "Not Found", detail=f"Appeal {appeal_id} not found")
        return appeal


@app.patch("/api/v1/appeals/{appeal_id}/approve", response_model=AppealResponse)
async def approve_appeal(appeal_id: UUID, body: AppealApprove, user: CurrentUser):
    """Server-enforced human approval. Only billers, clinic_admins, or physician_reviewers can approve."""
    set_current_tenant(user.tenant_id)

    allowed_roles = {Role.BILLER, Role.CLINIC_ADMIN, Role.PHYSICIAN_REVIEWER, Role.PLATFORM_ADMIN}
    if not any(r in allowed_roles for r in user.roles):
        return problem_response(403, "Forbidden", detail="Only billers, clinic admins, or physician reviewers can approve appeals")

    async with _session(app) as session:
        appeal = await session.get(Appeal, appeal_id)
        if not appeal:
            return problem_response(404, "Not Found", detail=f"Appeal {appeal_id} not found")
        if not appeal.needs_review:
            return problem_response(409, "Already Approved", detail="This appeal has already been approved")

        appeal.needs_review = False
        appeal.approved_by = body.approved_by
        appeal.approved_at = datetime.now(timezone.utc)

        event = CloudEvent(
            source="appeals-svc",
            type="appeal.approved.v1",
            subject=str(appeal_id),
            tenantid=str(user.tenant_id),
            data={
                "appeal_id": str(appeal_id),
                "claim_id": str(appeal.claim_id),
                "approved_by": body.approved_by,
                "version": appeal.version,
            },
        )
        outbox = OutboxEntry(
            aggregatetype="appeal",
            aggregateid=str(appeal_id),
            type="appeal.approved.v1",
            payload=event.model_dump_json(),
        )
        session.add(outbox)

        # Also emit audit event
        audit_event = CloudEvent(
            source="appeals-svc",
            type="audit.appeal.approved",
            subject=str(appeal_id),
            tenantid=str(user.tenant_id),
            data={
                "actor_id": user.sub,
                "actor_role": user.roles[0].value if user.roles else "unknown",
                "action": "approve",
                "resource_type": "appeal",
                "resource_id": str(appeal_id),
                "detail": {"version": appeal.version, "approved_by": body.approved_by},
            },
        )
        audit_outbox = OutboxEntry(
            aggregatetype="appeal",
            aggregateid=str(appeal_id),
            type="audit.appeal.approved",
            payload=audit_event.model_dump_json(),
        )
        session.add(audit_outbox)

        await session.commit()
        await session.refresh(appeal)
        return appeal


@app.patch("/api/v1/appeals/{appeal_id}/send", response_model=AppealResponse)
async def send_appeal(appeal_id: UUID, user: CurrentUser):
    """Mark an approved appeal as sent. Cannot send unapproved appeals."""
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        appeal = await session.get(Appeal, appeal_id)
        if not appeal:
            return problem_response(404, "Not Found", detail=f"Appeal {appeal_id} not found")
        if appeal.needs_review:
            return problem_response(
                409,
                "Not Approved",
                detail="Appeal must be approved before sending. Nothing is sent without server-enforced human approval.",
            )

        event = CloudEvent(
            source="appeals-svc",
            type="appeal.sent.v1",
            subject=str(appeal_id),
            tenantid=str(user.tenant_id),
            data={
                "appeal_id": str(appeal_id),
                "claim_id": str(appeal.claim_id),
                "version": appeal.version,
            },
        )
        outbox = OutboxEntry(
            aggregatetype="appeal",
            aggregateid=str(appeal_id),
            type="appeal.sent.v1",
            payload=event.model_dump_json(),
        )
        session.add(outbox)
        await session.commit()
        await session.refresh(appeal)
        return appeal
