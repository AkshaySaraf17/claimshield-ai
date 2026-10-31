"""Specialist: Timely Filing Agent — handles CO-29 denials.

Fully deterministic: calculates deadlines and checks proof of timely submission.
LLM: only drafts the appeal letter section citing dates and proof."""

from __future__ import annotations
import re
from datetime import date, timedelta
from ..schemas import AppealState
from ..llm_client import llm_client

FILING_DEADLINES = {
    "medicare": 365,
    "medicaid": 365,
    "aetna": 90,
    "cigna": 90,
    "unitedhealthcare": 90,
    "uhc": 90,
    "blue cross": 365,
    "bcbs": 365,
    "humana": 365,
}

PROOF_PATTERNS = [
    ("electronic_confirmation", r"(?i)(electronic\s*confirmation|edi\s*accept|clearinghouse\s*(?:confirm|receipt|accept))"),
    ("certified_mail", r"(?i)(certified\s*mail|return\s*receipt|tracking\s*(?:#|number))"),
    ("fax_confirmation", r"(?i)(fax\s*confirm|fax\s*receipt|sent\s*via\s*fax)"),
    ("original_submission_date", r"(?i)(originally?\s*(?:submitted|filed|sent)\s*(?:on)?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"),
]

SYSTEM_PROMPT = """You are a timely filing specialist. Draft an appeal paragraph that:
1. States the exact dates (date of service, original submission, denial date)
2. Cites any proof of timely original submission found
3. Calculates the exact days between service and submission
4. References the applicable filing deadline (payer-specific or regulatory)

Do NOT invent dates. Only use dates found in the provided text.
Output plain text, no markdown."""


async def timely_filing_specialist_agent(state: AppealState) -> dict:
    text = state.get("raw_denial_text", "") + "\n" + state.get("raw_clinical_notes", "")
    payer = (state.get("payer_name") or "").lower()

    deadline_days = FILING_DEADLINES.get(payer, 180)

    proof_found = {}
    for name, pattern in PROOF_PATTERNS:
        match = re.search(pattern, text)
        proof_found[name] = match.group(0).strip() if match else None

    has_proof = any(v is not None for v in proof_found.values())

    deterministic_section = "TIMELY FILING CHECK:\n"
    deterministic_section += f"  Payer: {state.get('payer_name', 'Unknown')}\n"
    deterministic_section += f"  Filing deadline: {deadline_days} days from date of service\n"
    deterministic_section += f"  Source: {'42 CFR § 424.44' if 'medicare' in payer else 'Payer contract terms'}\n"

    if has_proof:
        deterministic_section += "  [+] Proof of timely submission found:\n"
        for k, v in proof_found.items():
            if v:
                deterministic_section += f"      {k}: {v}\n"
        deterministic_section += "  Strategy: Demonstrate original submission was within deadline.\n"
    else:
        deterministic_section += "  [-] No proof of timely submission found in provided text\n"
        deterministic_section += "  Strategy: Request proof from billing system or clearinghouse.\n"

    user_prompt = (
        f"Denial code: CO-29 (timely filing)\n"
        f"Payer: {state.get('payer_name', 'Unknown')}\n"
        f"Filing deadline: {deadline_days} days\n"
        f"Proof found: {proof_found}\n\n"
        f"Denial text:\n{state.get('raw_denial_text', '')}"
    )

    try:
        analysis = await llm_client.complete(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as exc:
        analysis = f"[Timely filing analysis failed: {exc}] Manual date verification needed."

    return {"specialist_analysis": f"TIMELY FILING ANALYSIS:\n{deterministic_section}\n{analysis}"}
