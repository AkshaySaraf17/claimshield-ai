"""Specialist: Patient Responsibility Agent — handles PR-1/PR-2/PR-3 denials.

Deterministic: checks if denial is truly patient responsibility vs. payer error.
LLM: drafts response only if there's evidence of incorrect cost-sharing."""

from __future__ import annotations
import re
from ..schemas import AppealState
from ..llm_client import llm_client

PR_CODES = {
    "PR-1": "deductible",
    "PR-2": "coinsurance",
    "PR-3": "copayment",
}

OVERRIDE_PATTERNS = [
    ("preventive_service", r"(?i)(preventive|wellness|annual\s*physical|screening|immunization)"),
    ("in_network", r"(?i)(in.?network|participating\s*provider|contracted)"),
    ("aca_mandate", r"(?i)(aca|affordable\s*care|essential\s*health\s*benefit)"),
    ("coordination_of_benefits", r"(?i)(secondary|coordination|cob\b|other\s*insurance)"),
    ("max_oop_reached", r"(?i)(out.?of.?pocket\s*(?:max|limit)|oop\s*(?:max|limit)|maximum\s*reached)"),
]

SYSTEM_PROMPT = """You are a patient financial counselor and benefits specialist.
Given a patient responsibility denial (deductible/coinsurance/copay), determine if:
1. The charge should actually be zero cost-sharing (preventive care under ACA)
2. The accumulator may be incorrect (max OOP already reached)
3. Coordination of benefits was missed
4. The cost-sharing was calculated incorrectly

Only recommend an appeal if there is evidence of error. If the patient responsibility
is correct, say so clearly — do not draft a frivolous appeal.
Output plain text, no markdown."""


async def patient_responsibility_specialist_agent(state: AppealState) -> dict:
    code = (state.get("denial_code") or "").upper().strip()
    category = PR_CODES.get(code, "cost-sharing")
    text = state.get("raw_denial_text", "") + "\n" + state.get("raw_clinical_notes", "")

    overrides = {}
    for name, pattern in OVERRIDE_PATTERNS:
        match = re.search(pattern, text)
        overrides[name] = match.group(0).strip() if match else None

    has_override = any(v is not None for v in overrides.values())

    deterministic_section = f"PATIENT RESPONSIBILITY CHECK ({code} — {category}):\n"
    if has_override:
        deterministic_section += "  [!] Potential override factors found:\n"
        for k, v in overrides.items():
            if v:
                deterministic_section += f"      {k}: {v}\n"
        deterministic_section += "  Strategy: Verify cost-sharing calculation and appeal if incorrect.\n"
    else:
        deterministic_section += "  [i] No override factors detected — this may be correct patient responsibility.\n"
        deterministic_section += "  Strategy: Verify accumulator totals before appealing.\n"

    user_prompt = (
        f"Denial code: {code} ({category})\n"
        f"Payer: {state.get('payer_name', 'Unknown')}\n"
        f"Amount: ${(state.get('amount_denied_cents') or 0) / 100:.2f}\n"
        f"Override factors: {overrides}\n\n"
        f"Denial text:\n{state.get('raw_denial_text', '')}\n\n"
        f"Clinical notes:\n{state.get('raw_clinical_notes', '')}"
    )

    try:
        analysis = await llm_client.complete(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as exc:
        analysis = f"[Patient responsibility analysis failed: {exc}] Manual benefit verification needed."

    return {"specialist_analysis": f"PATIENT RESPONSIBILITY ANALYSIS:\n{deterministic_section}\n{analysis}"}
