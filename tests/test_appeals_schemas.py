"""Tests for appeals service schemas and approval enforcement."""

from services.appeals.app.schemas import AppealCreate, AppealApprove, AppealResponse


def test_appeal_create_defaults_to_needs_review():
    a = AppealCreate(claim_id="00000000-0000-0000-0000-000000000001")
    assert a.needs_review is True


def test_appeal_create_with_content():
    a = AppealCreate(
        claim_id="00000000-0000-0000-0000-000000000001",
        letter_text="Dear Payer...",
        confidence=0.85,
    )
    assert a.letter_text == "Dear Payer..."
    assert a.confidence == 0.85
    assert a.needs_review is True  # always starts true regardless of confidence
