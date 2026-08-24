"""
Agent 3: Clinical Appeals Writer
Synthesizes the final appeal letter from the accumulated state.
"""
from app.schemas import AppealState
from app.llm_client import llm_client

SYSTEM_PROMPT = """You are a medical billing appeals specialist writing a
formal insurance appeal letter. Use a professional, factual clinical tone.
Do not invent facts not present in the provided evidence or clinical notes.
Structure: recipient line, subject line, opening statement of appeal,
clinical justification section citing the provided policy evidence, closing
request for reversal, sign-off. Output plain text only, no markdown."""


async def clinical_appeals_writer_agent(state: AppealState) -> dict:
    user_prompt = f"""
Payer: {state.get('payer_name')}
Denial code: {state.get('denial_code')}
Denial reason given by payer: {state.get('denial_reason')}
Amount denied: ${state.get('amount_denied', 0):.2f}

Policy evidence supporting reversal:
{state.get('retrieved_policy_evidence')}

Clinical notes (source of truth — do not contradict):
{state.get('raw_clinical_notes')}
"""
    try:
        letter = await llm_client.complete(system=SYSTEM_PROMPT, user=user_prompt)
    except Exception as exc:
        letter = (
            f"[DRAFT GENERATION FAILED: {exc}]\n\n"
            f"To: Appeals Department, {state.get('payer_name')}\n"
            f"RE: Appeal of denial code {state.get('denial_code')}\n\n"
            f"Evidence on file:\n{state.get('retrieved_policy_evidence')}\n\n"
            "A billing specialist must complete this letter manually."
        )

    return {"final_appeal_letter": letter}
