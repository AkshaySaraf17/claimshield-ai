"""Specialist: Authorization Agent — handles CO-197 (precertification absent) denials.

Deterministic: checks if authorization number is referenced in notes.
LLM: drafts appeal language for retroactive authorization or showing auth was obtained."""

from __future__ import annotations
import re
from ..schemas import AppealState
from ..llm_client import llm_client

AUTH_PATTERNS = [
    ("authorization_number", r"(?i)(auth(?:orization)?\s*(?:#|number|no\.?)\s*[:=]?\s*\w+)"),
    ("precert_reference", r"(?i)(precert|pre-cert|prior\s*auth)"),
    ("referral_number", r"(?i)(referral\s*(?:#|number|no\.?)\s*[:=]?\s*\w+)"),
    ("emergency_exception", r"(?i)(emergent|emergency|urgent|life.?threaten)"),
]

SYSTEM_PROMPT = """You are an authorization and precertification specialist.
Given the denial for missing precertification, draft appeal language that:
1. States whether authorization was obtained (cite the auth number if found)
2. If no auth was obtained, argues for retroactive authorization based on clinical urgency
3. References any emergency exceptions that may apply
4. Cites the payer's own authorization requirements if known

Do NOT invent authorization numbers or dates. Only reference what the notes contain.
Output plain text, no markdown."""


async def authorization_specialist_agent(state: AppealState) -> dict:
    notes = state.get("raw_clinical_notes", "") + "\n" + state.get("raw_denial_text", "")

    findings = {}
    for name, pattern in AUTH_PATTERNS:
        match = re.search(pattern, notes)
        findings[name] = match.group(0).strip() if match else None

    deterministic_section = "AUTHORIZATION CHECK:\n"
    if findings["authorization_number"]:
        deterministic_section += f"  [+] Auth number found: {findings['authorization_number']}\n"
        deterministic_section += "  Strategy: Show authorization WAS obtained — payer error.\n"
    elif findings["emergency_exception"]:
        deterministic_section += f"  [!] Emergency language found: {findings['emergency_exception']}\n"
        deterministic_section += "  Strategy: Argue emergency exception to precertification requirement.\n"
    else:
        deterministic_section += "  [-] No authorization number found in notes\n"
        deterministic_section += "  Strategy: Request retroactive authorization with clinical justification.\n"

    user_prompt = (
        f"Denial code: CO-197 (precertification absent)\n"
        f"Payer: {state.get('payer_name', 'Unknown')}\n"
        f"Auth findings: {findings}\n\n"
        f"Denial text:\n{state.get('raw_denial_text', '')}\n\n"
        f"Clinical notes:\n{state.get('raw_clinical_notes', '')}"
    )

    try:
        analysis = await llm_client.complete(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as exc:
        analysis = f"[Authorization analysis failed: {exc}] Manual auth review needed."

    return {"specialist_analysis": f"AUTHORIZATION ANALYSIS:\n{deterministic_section}\n{analysis}"}
