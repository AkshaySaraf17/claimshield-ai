"""Specialist: Coding & Modifier Agent — handles CO-4, CO-97, bundling denials.

Deterministic: checks CCI edits and modifier requirements.
LLM: drafts modifier justification language only."""

from __future__ import annotations
from ..schemas import AppealState
from ..llm_client import llm_client

CCI_MODIFIER_GUIDANCE = {
    "CO-4": (
        "Modifier mismatch or missing modifier. Check if modifier 59, XE, XS, XP, or XU "
        "should have been appended. Review the operative note for distinct procedural services. "
        "Source: CMS CCI quarterly edits; CPT Appendix A modifiers."
    ),
    "CO-97": (
        "Bundled service. The denied procedure is considered part of the primary procedure. "
        "If the services were distinct, modifier 59 or an X{EPSU} modifier should be applied. "
        "Source: CMS CCI edits; NCCI Policy Manual Chapter 1."
    ),
}

SYSTEM_PROMPT = """You are a certified medical coder specializing in modifier usage and CCI edits.
Given the denial details and clinical notes, write a brief justification paragraph explaining
why the procedures were distinct services requiring separate reimbursement.
Do NOT invent clinical facts. Only reference what the notes contain.
Output plain text, no markdown. Be specific about which modifier applies and why."""


async def coding_specialist_agent(state: AppealState) -> dict:
    code = (state.get("denial_code") or "").upper().strip()
    guidance = CCI_MODIFIER_GUIDANCE.get(code, "")

    if not guidance:
        return {"specialist_analysis": "No coding-specific guidance for this denial code."}

    user_prompt = (
        f"Denial code: {code}\n"
        f"Payer: {state.get('payer_name', 'Unknown')}\n"
        f"CCI/Modifier guidance: {guidance}\n\n"
        f"Clinical notes:\n{state.get('raw_clinical_notes', 'Not provided')}"
    )

    try:
        analysis = await llm_client.complete(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as exc:
        analysis = f"[Coding analysis failed: {exc}] Manual modifier review needed. {guidance}"

    return {"specialist_analysis": f"CODING ANALYSIS:\n{guidance}\n\n{analysis}"}
