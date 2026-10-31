"""Tests for claims service schemas and status machine."""

import pytest
from services.claims.app.schemas import ALLOWED_TRANSITIONS, VALID_STATUSES, ClaimCreate, StatusTransition


def test_all_statuses_have_transitions():
    for status in VALID_STATUSES:
        assert status in ALLOWED_TRANSITIONS, f"Missing transition entry for {status}"


def test_terminal_states_have_no_transitions():
    assert ALLOWED_TRANSITIONS["won"] == set()
    assert ALLOWED_TRANSITIONS["cancelled"] == set()


def test_valid_forward_flow():
    flow = ["pending_review", "in_progress", "needs_review", "approved", "sent", "won"]
    for i in range(len(flow) - 1):
        current, next_status = flow[i], flow[i + 1]
        assert next_status in ALLOWED_TRANSITIONS[current], f"Cannot transition {current} -> {next_status}"


def test_cancelled_reachable_from_most_states():
    for status in ("pending_review", "in_progress", "needs_review", "approved"):
        assert "cancelled" in ALLOWED_TRANSITIONS[status]


def test_lost_can_retry():
    assert "in_progress" in ALLOWED_TRANSITIONS["lost"]


def test_claim_create_schema():
    c = ClaimCreate(
        clinic_id="00000000-0000-0000-0000-000000000001",
        raw_denial_text="Denied for medical necessity",
        raw_clinical_notes="Patient presented with...",
        amount_denied_cents=150000,
    )
    assert c.amount_denied_cents == 150000
    assert c.patient_id is None
