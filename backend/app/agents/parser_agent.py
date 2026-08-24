"""
Agent 1: Document Parser
Converts unstructured denial-letter text into a structured JSON record.
"""
from app.schemas import AppealState
from app.llm_client import llm_client, safe_json_parse

SYSTEM_PROMPT = """You are a medical billing coding specialist. Extract structured
fields from a raw insurance denial letter. Respond with ONLY a JSON object, no
prose, no markdown fences, with exactly these keys:
{
  "denial_code": string (e.g. "CO-50"),
  "denial_reason": string (plain-English reason),
  "payer_name": string,
  "amount_denied": number
}
If a field cannot be determined, use your best inference from context; never
leave a field blank."""

FALLBACK = {
    "denial_code": "UNKNOWN",
    "denial_reason": "Could not be automatically determined — needs manual review.",
    "payer_name": "Unknown Payer",
    "amount_denied": 0.0,
}


async def document_parser_agent(state: AppealState) -> dict:
    try:
        raw = await llm_client.complete(
            system=SYSTEM_PROMPT,
            user=state["raw_denial_text"],
            json_mode=True,
        )
        parsed = safe_json_parse(raw, FALLBACK)
    except Exception as exc:
        parsed = {**FALLBACK, "denial_reason": f"Parser agent error: {exc}"}

    return {
        "denial_code": parsed.get("denial_code", FALLBACK["denial_code"]),
        "denial_reason": parsed.get("denial_reason", FALLBACK["denial_reason"]),
        "payer_name": parsed.get("payer_name", FALLBACK["payer_name"]),
        "amount_denied": float(parsed.get("amount_denied", 0.0) or 0.0),
    }
