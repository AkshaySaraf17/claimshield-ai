"""Specialist: Coordinator / General Agent — handles denial codes without a specialized agent.

Covers: CO-16 (missing info), CO-18 (duplicate), CO-109 (not covered), CO-242 (network),
OA-23 (coordination of benefits), and any unrecognized codes.

Deterministic: categorizes the denial and checks for common data issues.
LLM: drafts a general appeal paragraph."""

from __future__ import annotations
import re
from ..schemas import AppealState
from ..llm_client import llm_client

GENERAL_GUIDANCE = {
    "CO-16": (
        "Missing information. Common causes: missing NPI, incorrect diagnosis pointer, "
        "missing referring provider, incomplete patient demographics. "
        "Source: CARC/RARC code set."
    ),
    "CO-18": (
        "Duplicate claim. Verify if original was paid under a different claim number. "
        "If this is a corrected claim, ensure proper frequency code (7 or 8) was used. "
        "Source: CARC/RARC code set."
    ),
    "CO-109": (
        "Not covered by this payer. Verify patient eligibility, check if claim went "
        "to the wrong payer, or if coverage was terminated. "
        "Source: CARC/RARC code set."
    ),
    "CO-242": (
        "Out-of-network provider. If emergency or no in-network option was available, "
        "cite surprise billing protections (No Surprises Act). "
        "Source: CARC/RARC code set; No Surprises Act (P.L. 116-260)."
    ),
    "OA-23": (
        "Coordination of benefits adjustment. Verify correct primary/secondary payer order. "
        "Submit the primary payer's EOB with the secondary claim. "
        "Source: CARC/RARC code set."
    ),
}

SYSTEM_PROMPT = """You are a general medical billing specialist. Draft a brief appeal
paragraph for this denial. Be professional and factual. Reference the guidance provided
and any relevant details from the clinical notes.
Do NOT invent facts not present in the provided evidence.
Output plain text, no markdown."""


async def coordinator_specialist_agent(state: AppealState) -> dict:
    code = (state.get("denial_code") or "").upper().strip()
    guidance = GENERAL_GUIDANCE.get(code, "")

    if not guidance:
        guidance = (
            f"Unrecognized denial code '{state.get('denial_code')}'. "
            "Manual review recommended to determine the correct appeal strategy. "
            "Check CARC/RARC code reference for guidance."
        )

    user_prompt = (
        f"Denial code: {code}\n"
        f"Payer: {state.get('payer_name', 'Unknown')}\n"
        f"Denial reason: {state.get('denial_reason', 'Not provided')}\n"
        f"Guidance: {guidance}\n\n"
        f"Denial text:\n{state.get('raw_denial_text', '')}\n\n"
        f"Clinical notes:\n{state.get('raw_clinical_notes', '')}"
    )

    try:
        analysis = await llm_client.complete(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as exc:
        analysis = f"[General analysis failed: {exc}] Manual review needed. {guidance}"

    return {"specialist_analysis": f"GENERAL ANALYSIS:\n{guidance}\n\n{analysis}"}
