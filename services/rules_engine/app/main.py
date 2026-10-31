"""Rules engine service — deterministic pre/post-LLM checks."""

from __future__ import annotations

from datetime import date
from fastapi import FastAPI
from pydantic import BaseModel

from .rules import RuleResult, run_all_rules

app = FastAPI(title="ClaimShield Rules Engine")


@app.get("/health")
async def health():
    return {"status": "ok"}


class RuleCheckRequest(BaseModel):
    payer_name: str | None = None
    denial_code: str | None = None
    date_of_service: date | None = None
    primary_cpt: str | None = None
    secondary_cpts: list[str] | None = None


class RuleCheckResponse(BaseModel):
    results: list[dict]
    has_blockers: bool


@app.post("/api/v1/rules/check", response_model=RuleCheckResponse)
async def check_rules(body: RuleCheckRequest):
    results = run_all_rules(
        payer_name=body.payer_name,
        denial_code=body.denial_code,
        date_of_service=body.date_of_service,
        primary_cpt=body.primary_cpt,
        secondary_cpts=body.secondary_cpts,
    )
    return RuleCheckResponse(
        results=[
            {
                "rule_id": r.rule_id,
                "passed": r.passed,
                "severity": r.severity.value,
                "message": r.message,
                "source": r.source,
                "details": r.details,
            }
            for r in results
        ],
        has_blockers=any(not r.passed and r.severity == "block" for r in results),
    )
