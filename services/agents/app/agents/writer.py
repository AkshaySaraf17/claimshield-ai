"""Agent 3: Clinical Appeals Writer — generates the appeal letter.

Output always requires human review. The writer reports its own confidence."""

from __future__ import annotations
from ..schemas import AppealState
from ..llm_client import llm_client

SYSTEM_PROMPT = """You are a medical billing appeals specialist writing a
formal insurance appeal letter. Use a professional, factual clinical tone.
Do not invent facts not present in the provided evidence or clinical notes.
Structure: recipient line, subject line, opening statement of appeal,
clinical justification section citing the provided policy evidence, closing
request for reversal, sign-off. Output plain text only, no markdown.

At the end, on a new line, write: CONFIDENCE: <number between 0.0 and 1.0>
This reflects how strong the appeal case is based on the available evidence."""


async def clinical_appeals_writer_agent(state: AppealState) -> dict:
    amount_display = "unknown"
    if state.get("amount_denied_cents") is not None:
        dollars = state["amount_denied_cents"] / 100
        amount_display = f"${dollars:,.2f}"

    user_prompt = f"""
Payer: {state.get('payer_name') or 'Unknown — needs manual review'}
Denial code: {state.get('denial_code') or 'Unknown — needs manual review'}
Denial reason given by payer: {state.get('denial_reason') or 'Not provided'}
Amount denied: {amount_display}

Rule check results:
{_format_rules(state.get('rule_results'))}

Policy evidence supporting reversal:
{state.get('retrieved_policy_evidence') or 'No evidence found — manual research needed'}

Clinical notes (source of truth — do not contradict):
{state.get('raw_clinical_notes')}
"""
    try:
        letter = await llm_client.complete(system=SYSTEM_PROMPT, user=user_prompt)
        confidence = _extract_confidence(letter)
        letter_clean = _strip_confidence_line(letter)
    except Exception as exc:
        letter_clean = (
            f"[DRAFT GENERATION FAILED: {exc}]\n\n"
            f"To: Appeals Department, {state.get('payer_name') or 'Unknown Payer'}\n"
            f"RE: Appeal of denial code {state.get('denial_code') or 'UNKNOWN'}\n\n"
            f"Evidence on file:\n{state.get('retrieved_policy_evidence')}\n\n"
            "A billing specialist must complete this letter manually."
        )
        confidence = 0.0

    any_null = any(
        state.get(k) is None
        for k in ("denial_code", "payer_name", "denial_reason")
    )

    return {
        "final_appeal_letter": letter_clean,
        "writer_confidence": confidence,
        "needs_human_review": True,  # always true — nothing sent without human approval
    }


def _format_rules(results: list[dict] | None) -> str:
    if not results:
        return "No rule checks performed."
    lines = []
    for r in results:
        icon = "BLOCK" if r.get("severity") == "block" and not r.get("passed") else r.get("severity", "").upper()
        lines.append(f"[{icon}] {r.get('message', '')} (source: {r.get('source', 'N/A')})")
    return "\n".join(lines)


def _extract_confidence(text: str) -> float:
    for line in reversed(text.strip().splitlines()):
        if line.strip().startswith("CONFIDENCE:"):
            try:
                return float(line.split(":", 1)[1].strip())
            except ValueError:
                pass
    return 0.5


def _strip_confidence_line(text: str) -> str:
    lines = text.strip().splitlines()
    if lines and lines[-1].strip().startswith("CONFIDENCE:"):
        return "\n".join(lines[:-1]).strip()
    return text.strip()
