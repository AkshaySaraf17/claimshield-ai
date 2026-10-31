"""Agent 2: Compliance Researcher — looks up policy evidence.

Uses a static KB for now; will be replaced with pgvector similarity search
against the policy_clauses table once the policy corpus is embedded."""

from __future__ import annotations
from ..schemas import AppealState

STATIC_POLICY_KB = {
    "CO-4": "Procedure code inconsistent with modifier. Review CCI edits and ensure appropriate modifier (59/XE/XS/XP/XU) is applied. Source: CMS CCI quarterly edits.",
    "CO-16": "Claim/service lacks information needed for adjudication. Review the original submission for missing NPI, diagnosis pointers, or authorization numbers. Source: CARC/RARC code set.",
    "CO-18": "Exact duplicate claim/service. Verify the original claim was not already paid under a different claim number. Source: CARC/RARC code set.",
    "CO-29": "Timely filing limit has expired. If the claim was timely, provide proof of original submission (electronic confirmation, mail receipt). Source: 42 CFR § 424.44.",
    "CO-45": "Charges exceed fee schedule/maximum allowable amount. Appeal with documentation of medical necessity for charges above the fee schedule. Source: Medicare Fee Schedule.",
    "CO-50": "Payer medical policy generally requires documented functional impairment (e.g. mobility/ADL scores) to justify medical necessity for rehabilitative therapy. Cross-reference the clinical notes for objective measurements. Source: LCD/NCD medical necessity criteria.",
    "CO-97": "Payment included in allowance for another service/procedure. Verify whether modifier -59 was omitted on the original claim that would have unbundled the procedure. Source: CMS CCI edits.",
    "CO-109": "Claim not covered by this payer/contractor. Verify patient eligibility and that the claim was submitted to the correct payer. Source: CARC/RARC code set.",
    "CO-197": "Precertification/authorization/notification absent. Obtain and submit the authorization number if one was obtained. Source: Payer contract terms.",
    "PR-1": "Deductible amount. Patient responsibility per plan terms — verify deductible status and accumulator. Source: Patient benefit summary.",
    "PR-2": "Coinsurance amount. Patient responsibility per plan terms. Source: Patient benefit summary.",
    "PR-3": "Co-payment amount. Patient responsibility per plan terms. Source: Patient benefit summary.",
}

DEFAULT_EVIDENCE = (
    "No pre-indexed policy clause matched this denial code. A billing "
    "specialist should manually pull the payer's medical policy for this "
    "code before the appeal is finalized."
)


async def compliance_researcher_agent(state: AppealState) -> dict:
    code = (state.get("denial_code") or "").upper().strip()
    evidence = STATIC_POLICY_KB.get(code, DEFAULT_EVIDENCE)
    return {"retrieved_policy_evidence": evidence}
