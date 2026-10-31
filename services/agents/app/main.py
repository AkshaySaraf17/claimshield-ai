"""Agent pipeline service — runs the LangGraph denial→appeal pipeline."""

from __future__ import annotations

import logging
from fastapi import FastAPI
from pydantic import BaseModel, Field

from .graph import agent_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ClaimShield Agent Pipeline")


@app.get("/health")
async def health():
    return {"status": "ok"}


class PipelineRequest(BaseModel):
    denial_text: str = Field(..., description="Raw text from the insurer denial letter")
    clinical_notes: str = Field(..., description="Anonymized doctor notes and treatment codes")


class DenialSummary(BaseModel):
    denial_code: str | None
    denial_reason: str | None
    payer_name: str | None
    amount_denied_cents: int | None
    parser_confidence: float | None
    parser_needs_review: bool


class PipelineResponse(BaseModel):
    status: str
    denial_summary: DenialSummary
    rule_results: list[dict]
    has_rule_blockers: bool
    generated_appeal: str | None
    writer_confidence: float | None
    needs_human_review: bool


@app.post("/api/v1/pipeline/run", response_model=PipelineResponse)
async def run_pipeline(body: PipelineRequest):
    initial_state = {
        "raw_denial_text": body.denial_text,
        "raw_clinical_notes": body.clinical_notes,
    }

    result = await agent_engine.ainvoke(initial_state)

    return PipelineResponse(
        status="completed",
        denial_summary=DenialSummary(
            denial_code=result.get("denial_code"),
            denial_reason=result.get("denial_reason"),
            payer_name=result.get("payer_name"),
            amount_denied_cents=result.get("amount_denied_cents"),
            parser_confidence=result.get("parser_confidence"),
            parser_needs_review=result.get("parser_needs_review", True),
        ),
        rule_results=result.get("rule_results", []),
        has_rule_blockers=result.get("has_rule_blockers", False),
        generated_appeal=result.get("final_appeal_letter"),
        writer_confidence=result.get("writer_confidence"),
        needs_human_review=result.get("needs_human_review", True),
    )
