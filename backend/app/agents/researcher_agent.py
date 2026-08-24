"""
Agent 2: Compliance Researcher
Looks up policy clauses relevant to the denial code. This starts as a static
lookup table so the graph runs end-to-end without Supabase configured; swap
`search_policy_clauses` for a real pgvector query once your policy corpus is
embedded (see db/schema.sql and the README section "Wiring up real RAG").
"""
from app.schemas import AppealState
from app.config import settings

# Placeholder knowledge base, keyed by denial code. Replace with a pgvector
# similarity search against a `policy_clauses` table (see db/schema.sql).
STATIC_POLICY_KB = {
    "CO-50": (
        "Payer medical policy generally requires documented functional "
        "impairment (e.g. mobility/ADL scores) to justify medical necessity "
        "for rehabilitative therapy. Cross-reference the clinical notes for "
        "objective measurements that satisfy this threshold."
    ),
    "CO-97": (
        "This code indicates the service is bundled into a prior payment. "
        "Verify whether a modifier (e.g. -59) was omitted on the original "
        "claim that would have unbundled the procedure."
    ),
    "CO-16": (
        "Claim/service lacks information needed for adjudication. Review "
        "the original submission for missing NPI, diagnosis pointers, or "
        "authorization numbers."
    ),
}

DEFAULT_EVIDENCE = (
    "No pre-indexed policy clause matched this denial code. A billing "
    "specialist should manually pull the payer's medical policy for this "
    "code before the appeal is finalized."
)


async def compliance_researcher_agent(state: AppealState) -> dict:
    code = state.get("denial_code", "")

    if settings.supabase_url and settings.supabase_service_key:
        # Real pgvector path — implement once the DB is provisioned.
        evidence = await _search_supabase(code, state.get("raw_clinical_notes", ""))
    else:
        evidence = STATIC_POLICY_KB.get(code, DEFAULT_EVIDENCE)

    return {"retrieved_policy_evidence": evidence}


async def _search_supabase(denial_code: str, clinical_notes: str) -> str:
    """
    Extension point: embed `clinical_notes`, run a cosine-similarity match
    against the `policy_clauses` table in Supabase, and return the top
    matching clause text. Left unimplemented so the MVP runs without a DB.
    """
    return STATIC_POLICY_KB.get(denial_code, DEFAULT_EVIDENCE)
