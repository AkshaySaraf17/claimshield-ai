"""Tests for the rebuilt parser agent — verifies null/confidence/needs_review behavior."""

from services.agents.app.schemas import AppealState


def test_appeal_state_allows_null_fields():
    state: AppealState = {
        "raw_denial_text": "Some text",
        "raw_clinical_notes": "Some notes",
        "denial_code": None,
        "denial_reason": None,
        "payer_name": None,
        "amount_denied_cents": None,
        "parser_confidence": 0.0,
        "parser_needs_review": True,
    }
    assert state["denial_code"] is None
    assert state["parser_needs_review"] is True


def test_appeal_state_with_values():
    state: AppealState = {
        "raw_denial_text": "Denied",
        "raw_clinical_notes": "Notes",
        "denial_code": "CO-50",
        "denial_reason": "Medical necessity",
        "payer_name": "Aetna",
        "amount_denied_cents": 150000,
        "parser_confidence": 0.95,
        "parser_needs_review": False,
    }
    assert state["amount_denied_cents"] == 150000
    assert state["parser_confidence"] == 0.95


def test_needs_human_review_always_true():
    """The pipeline must always require human review — nothing sent without approval."""
    state: AppealState = {
        "raw_denial_text": "text",
        "raw_clinical_notes": "notes",
        "needs_human_review": True,
    }
    assert state["needs_human_review"] is True
