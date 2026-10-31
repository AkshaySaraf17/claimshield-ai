"""Deterministic rules — code decides; LLMs only draft/explain.

Each rule function returns a RuleResult. Every rule has a source field
documenting the regulation, CMS guideline, or payer policy it implements."""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import StrEnum


class RuleSeverity(StrEnum):
    BLOCK = "block"
    WARN = "warn"
    INFO = "info"


@dataclass
class RuleResult:
    rule_id: str
    passed: bool
    severity: RuleSeverity
    message: str
    source: str
    details: dict = field(default_factory=dict)


# --- Timely filing deadlines (days from date of service) ---
TIMELY_FILING_DAYS: dict[str, int] = {
    "medicare": 365,
    "medicaid": 365,
    "aetna": 90,
    "cigna": 90,
    "unitedhealthcare": 90,
    "uhc": 90,
    "blue_cross": 365,
    "bcbs": 365,
    "humana": 365,
    "default": 180,
}


def check_timely_filing(
    payer_name: str | None,
    date_of_service: date,
    today: date | None = None,
) -> RuleResult:
    today = today or date.today()
    key = (payer_name or "").lower().replace(" ", "_")
    deadline_days = TIMELY_FILING_DAYS.get(key, TIMELY_FILING_DAYS["default"])
    deadline = date_of_service + timedelta(days=deadline_days)
    days_remaining = (deadline - today).days

    if days_remaining < 0:
        return RuleResult(
            rule_id="timely_filing",
            passed=False,
            severity=RuleSeverity.BLOCK,
            message=f"Timely filing deadline passed {abs(days_remaining)} days ago for {payer_name or 'unknown payer'}",
            source="42 CFR § 424.44 (Medicare); payer-specific contract terms",
            details={"deadline": deadline.isoformat(), "days_remaining": days_remaining},
        )
    if days_remaining <= 30:
        return RuleResult(
            rule_id="timely_filing",
            passed=True,
            severity=RuleSeverity.WARN,
            message=f"Only {days_remaining} days remaining before timely filing deadline",
            source="42 CFR § 424.44 (Medicare); payer-specific contract terms",
            details={"deadline": deadline.isoformat(), "days_remaining": days_remaining},
        )
    return RuleResult(
        rule_id="timely_filing",
        passed=True,
        severity=RuleSeverity.INFO,
        message=f"{days_remaining} days remaining before timely filing deadline",
        source="42 CFR § 424.44 (Medicare); payer-specific contract terms",
        details={"deadline": deadline.isoformat(), "days_remaining": days_remaining},
    )


# --- Known denial codes and their categories ---
DENIAL_CODE_CATEGORIES: dict[str, dict] = {
    "CO-4": {"category": "coding", "description": "Procedure code inconsistent with modifier or missing modifier", "source": "CARC/RARC code set (X12 835)"},
    "CO-16": {"category": "missing_info", "description": "Claim lacks information needed for adjudication", "source": "CARC/RARC code set (X12 835)"},
    "CO-18": {"category": "duplicate", "description": "Exact duplicate claim/service", "source": "CARC/RARC code set (X12 835)"},
    "CO-29": {"category": "timely_filing", "description": "Timely filing limit has expired", "source": "CARC/RARC code set (X12 835)"},
    "CO-45": {"category": "fee_schedule", "description": "Charges exceed fee schedule/maximum allowable amount", "source": "CARC/RARC code set (X12 835)"},
    "CO-50": {"category": "medical_necessity", "description": "Non-covered service — not deemed medically necessary", "source": "CARC/RARC code set (X12 835)"},
    "CO-97": {"category": "bundling", "description": "Payment included in allowance for another service/procedure", "source": "CARC/RARC code set (X12 835); CCI edits"},
    "CO-109": {"category": "not_covered", "description": "Claim not covered by this payer/contractor", "source": "CARC/RARC code set (X12 835)"},
    "CO-197": {"category": "precertification", "description": "Precertification/authorization/notification absent", "source": "CARC/RARC code set (X12 835)"},
    "PR-1": {"category": "deductible", "description": "Deductible amount", "source": "CARC/RARC code set (X12 835)"},
    "PR-2": {"category": "coinsurance", "description": "Coinsurance amount", "source": "CARC/RARC code set (X12 835)"},
    "PR-3": {"category": "copay", "description": "Co-payment amount", "source": "CARC/RARC code set (X12 835)"},
}


def validate_denial_code(denial_code: str | None) -> RuleResult:
    if not denial_code:
        return RuleResult(
            rule_id="denial_code_validation",
            passed=True,
            severity=RuleSeverity.WARN,
            message="No denial code provided — needs manual review",
            source="Internal policy: all claims should have a denial code",
        )

    code_upper = denial_code.upper().strip()
    info = DENIAL_CODE_CATEGORIES.get(code_upper)
    if info:
        return RuleResult(
            rule_id="denial_code_validation",
            passed=True,
            severity=RuleSeverity.INFO,
            message=f"Known denial code {code_upper}: {info['description']}",
            source=info["source"],
            details={"category": info["category"], "description": info["description"]},
        )
    return RuleResult(
        rule_id="denial_code_validation",
        passed=True,
        severity=RuleSeverity.WARN,
        message=f"Unrecognized denial code '{denial_code}' — may need manual lookup",
        source="CARC/RARC code set (X12 835)",
    )


# --- Bundling / CCI edit checks ---
CCI_BUNDLES: dict[str, set[str]] = {
    "99213": {"36415", "81002", "81003"},
    "99214": {"36415", "81002", "81003"},
    "99215": {"36415", "81002", "81003"},
    "99291": {"99292"},
}


def check_bundling(
    primary_cpt: str | None,
    secondary_cpts: list[str] | None,
) -> RuleResult:
    if not primary_cpt or not secondary_cpts:
        return RuleResult(
            rule_id="bundling_check",
            passed=True,
            severity=RuleSeverity.INFO,
            message="Insufficient CPT data for bundling check",
            source="CMS Correct Coding Initiative (CCI) edits",
        )

    bundled = CCI_BUNDLES.get(primary_cpt, set())
    violations = [c for c in secondary_cpts if c in bundled]
    if violations:
        return RuleResult(
            rule_id="bundling_check",
            passed=False,
            severity=RuleSeverity.WARN,
            message=f"CPT {primary_cpt} bundles with {', '.join(violations)} per CCI edits — modifier 59/XE/XS/XP/XU may be needed",
            source="CMS Correct Coding Initiative (CCI) edits, quarterly update",
            details={"primary": primary_cpt, "bundled_codes": violations},
        )
    return RuleResult(
        rule_id="bundling_check",
        passed=True,
        severity=RuleSeverity.INFO,
        message="No CCI bundling conflicts detected",
        source="CMS Correct Coding Initiative (CCI) edits, quarterly update",
    )


def run_all_rules(
    payer_name: str | None = None,
    denial_code: str | None = None,
    date_of_service: date | None = None,
    primary_cpt: str | None = None,
    secondary_cpts: list[str] | None = None,
) -> list[RuleResult]:
    results = []
    results.append(validate_denial_code(denial_code))
    if date_of_service:
        results.append(check_timely_filing(payer_name, date_of_service))
    results.append(check_bundling(primary_cpt, secondary_cpts))
    return results
