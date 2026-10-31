"""Seed demo data — 10 claims across 6 payers with different denial codes."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone, timedelta

from .models import Tenant, Clinic, Claim, Appeal, AuditLog

DEV_TENANT_ID = "00000000-0000-0000-0000-000000000001"
DEV_CLINIC_ID = "00000000-0000-0000-0000-000000000010"
DEV_USER_ID = "dev-user-001"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ago(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _hash(prev: str | None, action: str, resource_type: str, resource_id: str, detail: dict | None) -> str:
    payload = json.dumps(
        {
            "prev_hash": prev or "",
            "tenant_id": DEV_TENANT_ID,
            "actor_id": DEV_USER_ID,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "detail": detail or {},
            "timestamp": _now().isoformat(),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


SEED_CLAIMS = [
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-001",
        "payer_name": "Aetna",
        "denial_code": "CO-50",
        "denial_reason": "Medical necessity not established",
        "raw_denial_text": "Claim denied: The submitted documentation does not support medical necessity for the requested procedure (CPT 97110). Additional clinical justification required including functional outcome measures.",
        "raw_clinical_notes": "Patient presents with chronic lower back pain. Physical therapy ordered 3x/week for 6 weeks. Functional limitation: unable to sit for more than 20 minutes.",
        "amount_denied_cents": 245000,
        "status": "pending_review",
        "created_at": _ago(2),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-002",
        "payer_name": "UnitedHealthcare",
        "denial_code": "CO-4",
        "denial_reason": "Procedure code inconsistent with modifier",
        "raw_denial_text": "Claim denied: The procedure code 29881 is inconsistent with the modifier used. The service appears to be bundled with primary procedure 29880.",
        "raw_clinical_notes": "Arthroscopic knee surgery performed. Meniscectomy (29881) and chondroplasty (29877) performed during same session. Modifier 59 appended.",
        "amount_denied_cents": 1850000,
        "status": "in_progress",
        "created_at": _ago(5),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-003",
        "payer_name": "Blue Cross Blue Shield",
        "denial_code": "CO-29",
        "denial_reason": "Timely filing limit exceeded",
        "raw_denial_text": "Claim denied: This claim was not received within the filing deadline. Claims must be submitted within 90 days of the date of service.",
        "raw_clinical_notes": "Office visit for diabetes management. A1C review, medication adjustment. Date of service: 2024-06-15.",
        "amount_denied_cents": 32500,
        "status": "needs_review",
        "created_at": _ago(8),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-004",
        "payer_name": "Cigna",
        "denial_code": "CO-197",
        "denial_reason": "Prior authorization required",
        "raw_denial_text": "Claim denied: Prior authorization/pre-certification was not obtained for this service. Authorization number required for MRI procedures.",
        "raw_clinical_notes": "MRI lumbar spine ordered for radiculopathy evaluation. Patient has failed conservative treatment over 6 weeks. Precert reference number: AUTH-2024-8891.",
        "amount_denied_cents": 425000,
        "status": "pending_review",
        "created_at": _ago(1),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-005",
        "payer_name": "Humana",
        "denial_code": "PR-1",
        "denial_reason": "Patient responsibility — deductible",
        "raw_denial_text": "This amount is the patient's responsibility under the deductible. The annual deductible has not been met for plan year 2024.",
        "raw_clinical_notes": "Annual wellness visit with labs. Preventive care services should be covered at 100% under ACA guidelines.",
        "amount_denied_cents": 18500,
        "status": "approved",
        "created_at": _ago(12),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-006",
        "payer_name": "Aetna",
        "denial_code": "CO-97",
        "denial_reason": "Payment adjusted — bundled procedure",
        "raw_denial_text": "Payment adjusted because this procedure is included in the payment for another procedure performed on the same date. CCI edit applies.",
        "raw_clinical_notes": "Shoulder arthroscopy with rotator cuff repair (29827) and subacromial decompression (29826). Separate incision sites documented.",
        "amount_denied_cents": 890000,
        "status": "pending_review",
        "created_at": _ago(3),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-007",
        "payer_name": "Medicare",
        "denial_code": "CO-16",
        "denial_reason": "Missing or invalid information",
        "raw_denial_text": "Claim denied: Missing or incomplete information. The referring provider NPI is required for this type of service.",
        "raw_clinical_notes": "Cardiac stress test ordered by Dr. Smith. Referred from primary care. NPI: 1234567890.",
        "amount_denied_cents": 67500,
        "status": "sent",
        "created_at": _ago(15),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-008",
        "payer_name": "Blue Cross Blue Shield",
        "denial_code": "CO-50",
        "denial_reason": "Medical necessity not met for extended stay",
        "raw_denial_text": "The admission on 2024-09-01 through 2024-09-05 does not meet medical necessity criteria. InterQual criteria not satisfied for days 4-5.",
        "raw_clinical_notes": "Inpatient admission for pneumonia. IV antibiotics administered. Patient showed improvement by day 3. Transitioned to oral antibiotics day 4. Observation status may have been appropriate.",
        "amount_denied_cents": 1250000,
        "status": "won",
        "created_at": _ago(30),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-009",
        "payer_name": "Cigna",
        "denial_code": "PR-2",
        "denial_reason": "Coinsurance amount",
        "raw_denial_text": "This is the amount of coinsurance the patient is responsible for. Plan pays 80% after deductible; 20% patient responsibility.",
        "raw_clinical_notes": "Outpatient surgery — carpal tunnel release. Patient has met annual deductible. Coordination of benefits may apply.",
        "amount_denied_cents": 54000,
        "status": "lost",
        "created_at": _ago(20),
    },
    {
        "id": str(uuid.uuid4()),
        "claim_number": "CLM-2024-010",
        "payer_name": "UnitedHealthcare",
        "denial_code": "CO-109",
        "denial_reason": "Not covered by this plan",
        "raw_denial_text": "Claim denied: This service is not covered under the member's current benefit plan. The procedure is considered experimental/investigational.",
        "raw_clinical_notes": "Platelet-rich plasma (PRP) injection for knee osteoarthritis. Patient has failed NSAIDs, physical therapy, and corticosteroid injections.",
        "amount_denied_cents": 175000,
        "status": "in_progress",
        "created_at": _ago(7),
    },
]


def build_seed_objects() -> tuple[list, list, list]:
    tenant = Tenant(
        id=DEV_TENANT_ID,
        name="Demo Healthcare Group",
        slug="demo-hcg",
    )
    clinic = Clinic(
        id=DEV_CLINIC_ID,
        tenant_id=DEV_TENANT_ID,
        name="Downtown Medical Center",
        npi="1234567890",
    )

    claims = []
    for c in SEED_CLAIMS:
        claims.append(Claim(
            tenant_id=DEV_TENANT_ID,
            clinic_id=DEV_CLINIC_ID,
            **c,
        ))

    audit_entries = []
    prev = None
    for i, c in enumerate(SEED_CLAIMS):
        h = _hash(prev, "claim.created", "claim", c["id"], {"denial_code": c["denial_code"]})
        audit_entries.append(AuditLog(
            tenant_id=DEV_TENANT_ID,
            actor_id=DEV_USER_ID,
            actor_role="biller",
            action="claim.created",
            resource_type="claim",
            resource_id=c["id"],
            detail=json.dumps({"denial_code": c["denial_code"], "payer": c["payer_name"]}),
            prev_hash=prev,
            hash=h,
            created_at=c["created_at"],
        ))
        prev = h

    return [tenant, clinic], claims, audit_entries
