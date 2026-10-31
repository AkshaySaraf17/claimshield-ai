"""Specialist: Medical Necessity Agent — handles CO-50 denials.

Deterministic: checks for required documentation elements (functional scores, ADL measures).
LLM: drafts medical necessity justification citing clinical evidence."""

from __future__ import annotations
import re
from ..schemas import AppealState
from ..llm_client import llm_client

REQUIRED_ELEMENTS = [
    ("functional score", r"(?i)(functional|barthel|karnofsky|fim\b|adl\b)"),
    ("objective measurement", r"(?i)(range of motion|rom\b|grip strength|mmse|gait speed)"),
    ("treatment history", r"(?i)(prior treatment|previously tried|failed|conservative)"),
    ("progression documentation", r"(?i)(worsening|progressive|decline|deteriorat)"),
]

SYSTEM_PROMPT = """You are a physician reviewer specializing in medical necessity appeals.
Given the denial and clinical notes, write a medical necessity justification that:
1. Cites specific clinical findings from the notes
2. References applicable LCD/NCD criteria if known
3. Explains why the service was medically necessary for THIS patient
4. Notes any objective measurements or functional scores present

Do NOT invent clinical facts. Only reference what the notes contain.
Output plain text, no markdown."""


def _check_documentation(clinical_notes: str) -> list[dict]:
    results = []
    for element_name, pattern in REQUIRED_ELEMENTS:
        found = bool(re.search(pattern, clinical_notes))
        results.append({
            "element": element_name,
            "found": found,
            "note": f"{'Present' if found else 'Missing'} in clinical notes",
        })
    return results


async def medical_necessity_specialist_agent(state: AppealState) -> dict:
    notes = state.get("raw_clinical_notes", "")
    doc_check = _check_documentation(notes)
    missing = [d["element"] for d in doc_check if not d["found"]]

    deterministic_section = "DOCUMENTATION CHECK:\n"
    for d in doc_check:
        icon = "+" if d["found"] else "-"
        deterministic_section += f"  [{icon}] {d['element']}: {d['note']}\n"

    if missing:
        deterministic_section += f"\nWARNING: Missing elements that strengthen medical necessity: {', '.join(missing)}\n"

    user_prompt = (
        f"Denial code: CO-50 (medical necessity)\n"
        f"Payer: {state.get('payer_name', 'Unknown')}\n"
        f"Denial reason: {state.get('denial_reason', 'Not provided')}\n\n"
        f"Documentation present: {[d['element'] for d in doc_check if d['found']]}\n"
        f"Documentation missing: {missing}\n\n"
        f"Clinical notes:\n{notes}"
    )

    try:
        analysis = await llm_client.complete(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as exc:
        analysis = f"[Medical necessity analysis failed: {exc}] Manual physician review needed."

    return {
        "specialist_analysis": f"MEDICAL NECESSITY ANALYSIS:\n{deterministic_section}\n{analysis}",
        "documentation_gaps": missing,
    }
