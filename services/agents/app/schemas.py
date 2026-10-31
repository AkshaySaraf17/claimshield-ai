"""Agent pipeline state and schemas."""

from __future__ import annotations
from typing import Optional, TypedDict


class AppealState(TypedDict, total=False):
    raw_denial_text: str
    raw_clinical_notes: str

    # Parser output — null means "could not determine", NOT a hallucinated guess
    denial_code: Optional[str]
    denial_reason: Optional[str]
    payer_name: Optional[str]
    amount_denied_cents: Optional[int]

    # Confidence and review flags
    parser_confidence: Optional[float]
    parser_needs_review: bool

    # Rule check results
    rule_results: Optional[list[dict]]
    has_rule_blockers: bool

    # Researcher output
    retrieved_policy_evidence: Optional[str]

    # Specialist routing
    denial_category: Optional[str]
    specialist_analysis: Optional[str]
    documentation_gaps: Optional[list[str]]

    # Writer output
    final_appeal_letter: Optional[str]
    writer_confidence: Optional[float]

    # Pipeline metadata
    needs_human_review: bool
    error: Optional[str]
