"""Synthetic test data generator for ClaimShield.

Generates realistic but completely fake denial scenarios, clinical notes,
and policy documents for local development and testing.
All data is synthetic — no real PHI, no real payer data.
"""

from __future__ import annotations

import json
import random
import uuid
from datetime import datetime, timedelta
from typing import Any

TENANT_ID = "00000000-0000-0000-0000-000000000001"
CLINIC_ID = "00000000-0000-0000-0000-000000000010"

PAYERS = [
    {"name": "Medicare", "id": "MCARE"},
    {"name": "Aetna", "id": "AETNA"},
    {"name": "UnitedHealthcare", "id": "UHC"},
    {"name": "Blue Cross Blue Shield", "id": "BCBS"},
    {"name": "Cigna", "id": "CIGNA"},
    {"name": "Humana", "id": "HUMANA"},
]

DENIAL_SCENARIOS = [
    {
        "code": "CO-4",
        "reason": "The procedure code is inconsistent with the modifier used or a required modifier is missing.",
        "category": "coding",
        "amount_cents": 45000,
        "procedures": ["99214", "99213", "99215"],
    },
    {
        "code": "CO-16",
        "reason": "Claim/service lacks information or has submission/billing error(s).",
        "category": "billing",
        "amount_cents": 32500,
        "procedures": ["99213", "99214"],
    },
    {
        "code": "CO-50",
        "reason": "These are non-covered services because this is not deemed a medical necessity by the payer.",
        "category": "medical_necessity",
        "amount_cents": 128000,
        "procedures": ["99215", "99214", "90837"],
    },
    {
        "code": "CO-97",
        "reason": "The benefit for this service is included in the payment/allowance for another service/procedure.",
        "category": "bundling",
        "amount_cents": 22000,
        "procedures": ["99213", "99214"],
    },
    {
        "code": "CO-29",
        "reason": "The time limit for filing has expired.",
        "category": "timely_filing",
        "amount_cents": 67500,
        "procedures": ["99214", "99215"],
    },
    {
        "code": "CO-18",
        "reason": "Exact duplicate claim/service.",
        "category": "duplicate",
        "amount_cents": 15000,
        "procedures": ["99213"],
    },
    {
        "code": "CO-197",
        "reason": "Precertification/authorization/notification absent.",
        "category": "authorization",
        "amount_cents": 235000,
        "procedures": ["99215", "90837"],
    },
    {
        "code": "OA-23",
        "reason": "The impact of prior payer(s) adjudication including payments and/or adjustments.",
        "category": "coordination",
        "amount_cents": 54000,
        "procedures": ["99214"],
    },
    {
        "code": "PR-1",
        "reason": "Deductible amount.",
        "category": "patient_responsibility",
        "amount_cents": 50000,
        "procedures": ["99214", "99213"],
    },
    {
        "code": "CO-242",
        "reason": "Services not provided by network/primary care providers.",
        "category": "network",
        "amount_cents": 89000,
        "procedures": ["99215"],
    },
]

PATIENT_FIRST_NAMES = [
    "Alex", "Jordan", "Morgan", "Casey", "Riley",
    "Taylor", "Jamie", "Quinn", "Avery", "Dakota",
]

PATIENT_LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones",
    "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
]

DIAGNOSES = [
    ("M54.5", "Low back pain"),
    ("E11.9", "Type 2 diabetes mellitus without complications"),
    ("I10", "Essential hypertension"),
    ("J06.9", "Acute upper respiratory infection"),
    ("F41.1", "Generalized anxiety disorder"),
    ("M79.3", "Panniculitis, unspecified"),
    ("K21.0", "Gastro-esophageal reflux disease with esophagitis"),
    ("G43.909", "Migraine, unspecified, not intractable"),
]

CLINICAL_TEMPLATES = [
    "Patient presented with {complaint}. History of {history}. "
    "Physical examination revealed {finding}. Assessment: {diagnosis_desc} ({diagnosis_code}). "
    "Plan: {plan}. Procedure {procedure} performed. Follow-up in {followup} weeks.",

    "Chief complaint: {complaint}. The patient has a {duration}-month history of {history}. "
    "On examination: {finding}. Diagnosis: {diagnosis_desc} ({diagnosis_code}). "
    "Treatment plan includes {plan}. CPT {procedure} billed. "
    "Return visit scheduled in {followup} weeks for reassessment.",

    "Established patient seen for {complaint}. Past medical history significant for {history}. "
    "Vital signs within normal limits. Exam: {finding}. "
    "ICD-10: {diagnosis_code} — {diagnosis_desc}. "
    "Management: {plan}. Service code {procedure}. Next appointment in {followup} weeks.",
]

COMPLAINTS = [
    "worsening lower back pain radiating to left leg",
    "persistent fatigue and increased thirst",
    "elevated blood pressure readings at home",
    "productive cough and nasal congestion for 5 days",
    "increasing anxiety with difficulty sleeping",
    "chronic abdominal discomfort after meals",
    "recurrent headaches with photosensitivity",
]

HISTORIES = [
    "chronic lower back pain managed conservatively",
    "diabetes managed with metformin",
    "hypertension on lisinopril 10mg daily",
    "recurrent upper respiratory infections",
    "anxiety treated with cognitive behavioral therapy",
    "GERD on omeprazole",
    "migraine with aura, on sumatriptan PRN",
]

FINDINGS = [
    "tenderness over L4-L5 spinous processes, negative straight leg raise",
    "BMI 32, acanthosis nigricans on neck",
    "BP 158/94, regular rate and rhythm, no murmurs",
    "bilateral nasal turbinate erythema, clear rhinorrhea",
    "mildly anxious affect, normal thought content",
    "mild epigastric tenderness, no rebound",
    "no focal neurological deficits, photophobia noted",
]

PLANS = [
    "physical therapy referral, NSAIDs, activity modification",
    "adjust metformin dose, dietary counseling, HbA1c in 3 months",
    "increase lisinopril to 20mg, recheck in 2 weeks",
    "supportive care, return if symptoms worsen or fever develops",
    "continue CBT, consider SSRI if no improvement in 4 weeks",
    "continue PPI, lifestyle modifications, consider EGD if persistent",
    "abortive therapy as needed, prophylaxis discussion at next visit",
]


def _random_date(days_back: int = 90) -> str:
    d = datetime.now() - timedelta(days=random.randint(1, days_back))
    return d.strftime("%Y-%m-%d")


def _random_patient_id() -> str:
    return f"PT-{random.randint(100000, 999999)}"


def generate_denial_letter(scenario: dict, payer: dict) -> str:
    date = _random_date(60)
    patient = f"{random.choice(PATIENT_FIRST_NAMES)} {random.choice(PATIENT_LAST_NAMES)}"
    member_id = f"{payer['id']}{random.randint(100000, 999999)}"
    procedure = random.choice(scenario["procedures"])
    amount = f"${scenario['amount_cents'] / 100:.2f}"

    return (
        f"EXPLANATION OF BENEFITS\n"
        f"Date: {date}\n"
        f"Payer: {payer['name']}\n"
        f"Member: {patient}\n"
        f"Member ID: {member_id}\n"
        f"Claim Number: CLM-{random.randint(1000000, 9999999)}\n"
        f"Provider: Synthetic Medical Group\n"
        f"Date of Service: {_random_date(90)}\n\n"
        f"DENIAL NOTICE\n\n"
        f"Procedure: {procedure}\n"
        f"Amount Billed: {amount}\n"
        f"Amount Allowed: $0.00\n"
        f"Amount Denied: {amount}\n\n"
        f"Reason Code: {scenario['code']}\n"
        f"Reason: {scenario['reason']}\n\n"
        f"If you disagree with this determination, you have the right to appeal. "
        f"Appeals must be submitted within the timeframe specified in your plan documents."
    )


def generate_clinical_notes(scenario: dict) -> str:
    idx = random.randint(0, len(DIAGNOSES) - 1)
    diag_code, diag_desc = DIAGNOSES[idx]
    idx2 = idx % len(COMPLAINTS)
    procedure = random.choice(scenario["procedures"])

    template = random.choice(CLINICAL_TEMPLATES)
    return template.format(
        complaint=COMPLAINTS[idx2],
        history=HISTORIES[idx2],
        finding=FINDINGS[idx2],
        diagnosis_code=diag_code,
        diagnosis_desc=diag_desc,
        plan=PLANS[idx2],
        procedure=procedure,
        duration=random.randint(2, 18),
        followup=random.choice([2, 4, 6, 8, 12]),
    )


def generate_claim_record(scenario: dict, payer: dict) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "tenant_id": TENANT_ID,
        "clinic_id": CLINIC_ID,
        "patient_id": _random_patient_id(),
        "claim_number": f"CLM-{random.randint(1000000, 9999999)}",
        "payer_name": payer["name"],
        "denial_code": scenario["code"],
        "denial_reason": scenario["reason"],
        "raw_denial_text": generate_denial_letter(scenario, payer),
        "raw_clinical_notes": generate_clinical_notes(scenario),
        "amount_denied_cents": scenario["amount_cents"],
        "amount_approved_cents": 0,
        "status": "pending_review",
        "reviewed_by": None,
        "reviewed_at": None,
    }


def generate_policy_document(payer: dict, scenario: dict) -> dict[str, Any]:
    code = scenario["code"]
    cat = scenario["category"]
    return {
        "payer_name": payer["name"],
        "denial_code": code,
        "source": f"{payer['name']} Provider Manual 2024, Section {random.randint(3, 12)}.{random.randint(1, 9)}",
        "document_text": (
            f"{payer['name']} Policy — {cat.replace('_', ' ').title()}\n\n"
            f"Denial code {code} is applied when: {scenario['reason']}\n\n"
            f"Appeal requirements:\n"
            f"- Submit within {random.choice([30, 60, 90, 180, 365])} days of denial\n"
            f"- Include supporting clinical documentation\n"
            f"- Reference the specific denial code and claim number\n"
            f"- Provide medical records demonstrating medical necessity\n\n"
            f"Successful appeals typically include:\n"
            f"1. A letter from the treating physician\n"
            f"2. Relevant clinical guidelines or literature\n"
            f"3. Complete medical records for the date of service\n"
            f"4. Any prior authorization documentation if applicable"
        ),
    }


def generate_dataset(
    num_claims: int = 20,
    num_policies: int = 10,
) -> dict[str, list]:
    claims = []
    denial_texts = []
    policies = []

    for _ in range(num_claims):
        scenario = random.choice(DENIAL_SCENARIOS)
        payer = random.choice(PAYERS)
        claim = generate_claim_record(scenario, payer)
        claims.append(claim)
        denial_texts.append({
            "denial_text": claim["raw_denial_text"],
            "clinical_notes": claim["raw_clinical_notes"],
        })

    for _ in range(num_policies):
        scenario = random.choice(DENIAL_SCENARIOS)
        payer = random.choice(PAYERS)
        policies.append(generate_policy_document(payer, scenario))

    return {
        "claims": claims,
        "denial_texts": denial_texts,
        "policies": policies,
    }


if __name__ == "__main__":
    random.seed(42)
    data = generate_dataset(num_claims=20, num_policies=10)
    print(json.dumps(data, indent=2, default=str))
    print(f"\nGenerated {len(data['claims'])} claims, {len(data['denial_texts'])} denial texts, {len(data['policies'])} policies")
