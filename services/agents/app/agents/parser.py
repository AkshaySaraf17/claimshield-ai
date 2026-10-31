"""Agent 1: Document Parser — extracts structured fields from denial text.

CRITICAL FIX from prototype: uses null + needs_review + confidence.
The parser must NEVER hallucinate. If a field cannot be determined from
the text, it must be null. The confidence score reflects how much of the
extraction came from clear textual evidence vs. inference."""

from __future__ import annotations
from ..schemas import AppealState
from ..llm_client import llm_client, safe_json_parse

SYSTEM_PROMPT = """You are a medical billing coding specialist. Extract structured
fields from a raw insurance denial letter. Respond with ONLY a JSON object.

Rules:
- If a field CANNOT be determined from the text, set it to null.
- Do NOT guess or infer values that are not clearly stated.
- Set confidence between 0.0 and 1.0 based on how clearly each field was found.
- Set needs_review to true if ANY field is null or confidence < 0.8.

Output exactly this JSON shape:
{
  "denial_code": string or null,
  "denial_reason": string or null,
  "payer_name": string or null,
  "amount_denied_cents": integer or null (amount in cents, e.g. 150000 for $1,500.00),
  "confidence": number between 0.0 and 1.0,
  "needs_review": boolean
}"""


async def document_parser_agent(state: AppealState) -> dict:
    try:
        raw = await llm_client.complete(
            system=SYSTEM_PROMPT,
            user=state["raw_denial_text"],
            json_mode=True,
        )
        parsed = safe_json_parse(raw, {})

        denial_code = parsed.get("denial_code")
        denial_reason = parsed.get("denial_reason")
        payer_name = parsed.get("payer_name")
        confidence = float(parsed.get("confidence", 0.0) or 0.0)

        # Convert dollars to cents if the LLM returned a float
        raw_amount = parsed.get("amount_denied_cents")
        if raw_amount is not None:
            if isinstance(raw_amount, float) and raw_amount > 0 and raw_amount < 100000:
                amount_denied_cents = round(raw_amount * 100)
            else:
                amount_denied_cents = int(raw_amount)
        else:
            amount_denied_cents = None

        any_null = any(v is None for v in [denial_code, denial_reason, payer_name, amount_denied_cents])
        needs_review = bool(parsed.get("needs_review", True)) or any_null or confidence < 0.8

    except Exception as exc:
        return {
            "denial_code": None,
            "denial_reason": None,
            "payer_name": None,
            "amount_denied_cents": None,
            "parser_confidence": 0.0,
            "parser_needs_review": True,
            "error": f"Parser agent error: {exc}",
        }

    return {
        "denial_code": denial_code,
        "denial_reason": denial_reason,
        "payer_name": payer_name,
        "amount_denied_cents": amount_denied_cents,
        "parser_confidence": confidence,
        "parser_needs_review": needs_review,
    }
