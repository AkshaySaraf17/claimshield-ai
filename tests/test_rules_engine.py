"""Tests for the deterministic rules engine."""

from datetime import date
import pytest

from services.rules_engine.app.rules import (
    RuleSeverity,
    check_bundling,
    check_timely_filing,
    run_all_rules,
    validate_denial_code,
)


def test_timely_filing_passed():
    result = check_timely_filing("Medicare", date(2026, 10, 1), today=date(2026, 10, 15))
    assert result.passed is True
    assert result.severity == RuleSeverity.INFO


def test_timely_filing_expired():
    result = check_timely_filing("Aetna", date(2026, 1, 1), today=date(2026, 10, 30))
    assert result.passed is False
    assert result.severity == RuleSeverity.BLOCK
    assert "deadline passed" in result.message


def test_timely_filing_warning():
    result = check_timely_filing("Aetna", date(2026, 8, 15), today=date(2026, 10, 30))
    assert result.passed is True
    assert result.severity == RuleSeverity.WARN


def test_known_denial_code():
    result = validate_denial_code("CO-50")
    assert result.passed is True
    assert "medically necessary" in result.message.lower() or "medical necessity" in result.details.get("category", "")
    assert result.source  # every rule has a source


def test_unknown_denial_code():
    result = validate_denial_code("XX-999")
    assert result.passed is True
    assert result.severity == RuleSeverity.WARN
    assert "unrecognized" in result.message.lower()


def test_null_denial_code():
    result = validate_denial_code(None)
    assert result.severity == RuleSeverity.WARN


def test_bundling_violation():
    result = check_bundling("99213", ["36415", "90471"])
    assert result.passed is False
    assert "36415" in result.message


def test_bundling_clean():
    result = check_bundling("99213", ["90471"])
    assert result.passed is True


def test_all_rules_have_source():
    results = run_all_rules(
        payer_name="Medicare",
        denial_code="CO-50",
        date_of_service=date(2026, 10, 1),
    )
    for r in results:
        assert r.source, f"Rule {r.rule_id} missing source field"


def test_run_all_rules_returns_multiple():
    results = run_all_rules(
        payer_name="Aetna",
        denial_code="CO-97",
        date_of_service=date(2026, 10, 1),
        primary_cpt="99213",
        secondary_cpts=["36415"],
    )
    rule_ids = {r.rule_id for r in results}
    assert "denial_code_validation" in rule_ids
    assert "timely_filing" in rule_ids
    assert "bundling_check" in rule_ids
