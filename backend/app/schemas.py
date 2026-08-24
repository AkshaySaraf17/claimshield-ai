"""
Pydantic schemas shared across the API layer and the LangGraph agent state.
"""
from typing import Optional, TypedDict
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Graph state (LangGraph state must be a TypedDict or dataclass, not a
# pydantic BaseModel subclassing a nonexistent `State` class)
# ---------------------------------------------------------------------------
class AppealState(TypedDict, total=False):
    raw_denial_text: str
    raw_clinical_notes: str
    denial_code: str
    denial_reason: str
    payer_name: str
    amount_denied: float
    retrieved_policy_evidence: str
    final_appeal_letter: str
    error: Optional[str]


# ---------------------------------------------------------------------------
# API request / response models
# ---------------------------------------------------------------------------
class IngestionPayload(BaseModel):
    denial_text: str = Field(..., description="Raw text extracted from the insurer denial letter.")
    clinical_notes: str = Field(..., description="Anonymized doctor notes and treatment codes.")


class DenialSummary(BaseModel):
    denial_code: str
    denial_reason: str
    payer_name: str
    amount_denied: float


class AppealResponse(BaseModel):
    status: str
    denial_summary: DenialSummary
    generated_appeal: str
    requires_human_review: bool = True
