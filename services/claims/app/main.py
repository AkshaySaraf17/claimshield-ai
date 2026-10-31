"""Claims service — tenant-scoped CRUD with status state machine."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query
from sqlalchemy import select, update

from claimshield_common.auth import CurrentUser, Role, require_role
from claimshield_common.db import create_engine, create_session_factory
from claimshield_common.events import CloudEvent, OutboxEntry
from claimshield_common.models import Claim
from claimshield_common.problem import problem_response
from claimshield_common.tenancy import bind_tenant_to_session, set_current_tenant

from .schemas import (
    ALLOWED_TRANSITIONS,
    ClaimCreate,
    ClaimResponse,
    ClaimUpdate,
    StatusTransition,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_engine()
    app.state.session_factory = create_session_factory(engine)
    yield
    await engine.dispose()


app = FastAPI(title="ClaimShield Claims Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


def _session(app_instance: FastAPI):
    sf = app_instance.state.session_factory
    session = sf()
    bind_tenant_to_session(session)
    return session


@app.post("/api/v1/claims", response_model=ClaimResponse, status_code=201)
async def create_claim(body: ClaimCreate, user: CurrentUser):
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        claim = Claim(
            tenant_id=user.tenant_id,
            clinic_id=body.clinic_id,
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

        event = CloudEvent(
            source="claims-svc",
            type="claim.created.v1",
            subject=str(claim.id),
            tenantid=str(user.tenant_id),
            data={
                "claim_id": str(claim.id),
                "clinic_id": str(body.clinic_id),
                "denial_code": body.denial_code,
                "amount_denied_cents": body.amount_denied_cents,
            },
        )
        outbox = OutboxEntry(
            aggregatetype="claim",
            aggregateid=str(claim.id),
            type="claim.created.v1",
            payload=event.model_dump_json(),
        )
        session.add(outbox)
        await session.commit()
        await session.refresh(claim)
        return claim


@app.get("/api/v1/claims", response_model=list[ClaimResponse])
async def list_claims(
    user: CurrentUser,
    status: str | None = None,
    clinic_id: UUID | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        q = select(Claim).order_by(Claim.created_at.desc()).limit(limit).offset(offset)
        if status:
            q = q.where(Claim.status == status)
        if clinic_id:
            q = q.where(Claim.clinic_id == clinic_id)
        result = await session.execute(q)
        return result.scalars().all()


@app.get("/api/v1/claims/{claim_id}", response_model=ClaimResponse)
async def get_claim(claim_id: UUID, user: CurrentUser):
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        claim = await session.get(Claim, claim_id)
        if not claim:
            return problem_response(404, "Not Found", detail=f"Claim {claim_id} not found")
        return claim


@app.patch("/api/v1/claims/{claim_id}", response_model=ClaimResponse)
async def update_claim(claim_id: UUID, body: ClaimUpdate, user: CurrentUser):
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        claim = await session.get(Claim, claim_id)
        if not claim:
            return problem_response(404, "Not Found", detail=f"Claim {claim_id} not found")

        updates = body.model_dump(exclude_unset=True)
        for k, v in updates.items():
            setattr(claim, k, v)
        claim.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(claim)
        return claim


@app.patch("/api/v1/claims/{claim_id}/status", response_model=ClaimResponse)
async def transition_status(claim_id: UUID, body: StatusTransition, user: CurrentUser):
    set_current_tenant(user.tenant_id)
    async with _session(app) as session:
        claim = await session.get(Claim, claim_id)
        if not claim:
            return problem_response(404, "Not Found", detail=f"Claim {claim_id} not found")

        allowed = ALLOWED_TRANSITIONS.get(claim.status, set())
        if body.status not in allowed:
            return problem_response(
                409,
                "Invalid Transition",
                detail=f"Cannot transition from '{claim.status}' to '{body.status}'. Allowed: {sorted(allowed)}",
            )

        old_status = claim.status
        claim.status = body.status
        claim.updated_at = datetime.now(timezone.utc)
        if body.reviewed_by:
            claim.reviewed_by = body.reviewed_by
            claim.reviewed_at = datetime.now(timezone.utc)

        event = CloudEvent(
            source="claims-svc",
            type="claim.status_changed.v1",
            subject=str(claim_id),
            tenantid=str(user.tenant_id),
            data={
                "claim_id": str(claim_id),
                "old_status": old_status,
                "new_status": body.status,
                "actor": user.sub,
            },
        )
        outbox = OutboxEntry(
            aggregatetype="claim",
            aggregateid=str(claim_id),
            type="claim.status_changed.v1",
            payload=event.model_dump_json(),
        )
        session.add(outbox)
        await session.commit()
        await session.refresh(claim)
        return claim
