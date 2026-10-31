"""EDI 835 (Electronic Remittance Advice) parser.

Parses X12 835 transaction sets to extract structured denial data:
CARC/RARC codes, amounts, dates, payer info, and claim references.

This is a deterministic parser — no LLM involved. It handles the standard
835 segment structure: ISA/GS/ST → BPR → TRN → 1000A/B → 2100/2110 → SE/GE/IEA.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date


@dataclass
class ServiceAdjustment:
    group_code: str  # CO, PR, OA, PI, CR
    reason_code: str  # CARC code
    amount_cents: int
    quantity: int = 0


@dataclass
class ServiceLine:
    procedure_code: str | None = None
    modifier: str | None = None
    charge_amount_cents: int = 0
    paid_amount_cents: int = 0
    adjustments: list[ServiceAdjustment] = field(default_factory=list)
    date_of_service: date | None = None
    remark_codes: list[str] = field(default_factory=list)


@dataclass
class ClaimRemittance:
    claim_id: str | None = None
    patient_name: str | None = None
    payer_name: str | None = None
    payee_name: str | None = None
    claim_status: str | None = None
    total_charge_cents: int = 0
    total_paid_cents: int = 0
    patient_responsibility_cents: int = 0
    service_lines: list[ServiceLine] = field(default_factory=list)
    filing_indicator: str | None = None

    @property
    def total_denied_cents(self) -> int:
        return self.total_charge_cents - self.total_paid_cents - self.patient_responsibility_cents

    @property
    def denial_codes(self) -> list[str]:
        codes = []
        for svc in self.service_lines:
            for adj in svc.adjustments:
                code = f"{adj.group_code}-{adj.reason_code}"
                if code not in codes:
                    codes.append(code)
        return codes

    @property
    def remark_codes(self) -> list[str]:
        codes = []
        for svc in self.service_lines:
            for rc in svc.remark_codes:
                if rc not in codes:
                    codes.append(rc)
        return codes


@dataclass
class ParsedERA:
    """Parsed Electronic Remittance Advice (835)."""
    payer_name: str | None = None
    payee_name: str | None = None
    check_number: str | None = None
    check_date: date | None = None
    total_paid_cents: int = 0
    claims: list[ClaimRemittance] = field(default_factory=list)
    raw_segment_count: int = 0
    errors: list[str] = field(default_factory=list)


def _dollars_to_cents(amount_str: str) -> int:
    """Convert EDI dollar amount string to integer cents."""
    try:
        return round(float(amount_str) * 100)
    except (ValueError, TypeError):
        return 0


def _parse_date(date_str: str) -> date | None:
    """Parse CCYYMMDD date format used in X12."""
    if not date_str or len(date_str) != 8:
        return None
    try:
        return date(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]))
    except ValueError:
        return None


def parse_835(raw: str) -> ParsedERA:
    """Parse an X12 835 transaction set.

    Handles both standard ~ segment terminators and newline-separated segments.
    """
    raw = raw.strip()

    # Detect segment terminator from ISA
    if raw.startswith("ISA"):
        # ISA is always 106 characters; terminator is the last char
        if len(raw) >= 106:
            terminator = raw[105]
        else:
            terminator = "~"
    else:
        terminator = "~"

    # Handle newline-based EDI
    if terminator == "\n" or "\n" in raw and "~" not in raw:
        segments = [s.strip() for s in raw.split("\n") if s.strip()]
    else:
        segments = [s.strip() for s in raw.split(terminator) if s.strip()]

    result = ParsedERA(raw_segment_count=len(segments))

    # Detect element separator from ISA
    element_sep = "*"
    if segments and segments[0].startswith("ISA"):
        parts = segments[0]
        if len(parts) > 3:
            element_sep = parts[3]

    current_claim: ClaimRemittance | None = None
    current_service: ServiceLine | None = None

    for seg in segments:
        elements = seg.split(element_sep)
        seg_id = elements[0] if elements else ""

        if seg_id == "N1":
            # N1 loop: payer (PR) or payee (PE) identification
            qualifier = elements[1] if len(elements) > 1 else ""
            name = elements[2] if len(elements) > 2 else ""
            if qualifier == "PR":
                result.payer_name = name
            elif qualifier == "PE":
                result.payee_name = name

        elif seg_id == "BPR":
            # Payment info
            if len(elements) > 2:
                result.total_paid_cents = _dollars_to_cents(elements[2])
            if len(elements) > 16:
                result.check_date = _parse_date(elements[16])

        elif seg_id == "TRN":
            # Check/trace number
            if len(elements) > 2:
                result.check_number = elements[2]

        elif seg_id == "CLP":
            # Claim-level info — start new claim
            if current_claim is not None:
                result.claims.append(current_claim)
            current_claim = ClaimRemittance(
                payer_name=result.payer_name,
                payee_name=result.payee_name,
            )
            current_service = None

            if len(elements) > 1:
                current_claim.claim_id = elements[1]
            if len(elements) > 2:
                current_claim.claim_status = elements[2]
            if len(elements) > 3:
                current_claim.total_charge_cents = _dollars_to_cents(elements[3])
            if len(elements) > 4:
                current_claim.total_paid_cents = _dollars_to_cents(elements[4])
            if len(elements) > 5:
                current_claim.patient_responsibility_cents = _dollars_to_cents(elements[5]) if elements[5] else 0
            if len(elements) > 6:
                current_claim.filing_indicator = elements[6]

        elif seg_id == "NM1" and current_claim is not None:
            qualifier = elements[1] if len(elements) > 1 else ""
            if qualifier == "QC" and len(elements) > 3:
                last = elements[3] if len(elements) > 3 else ""
                first = elements[4] if len(elements) > 4 else ""
                current_claim.patient_name = f"{last}, {first}".strip(", ")

        elif seg_id == "SVC":
            # Service line
            current_service = ServiceLine()
            if current_claim is not None:
                current_claim.service_lines.append(current_service)

            if len(elements) > 1:
                # SVC01 is composite: qualifier:code[:modifier]
                parts = elements[1].split(":")
                if len(parts) >= 2:
                    current_service.procedure_code = parts[1]
                if len(parts) >= 3:
                    current_service.modifier = parts[2]

            if len(elements) > 2:
                current_service.charge_amount_cents = _dollars_to_cents(elements[2])
            if len(elements) > 3:
                current_service.paid_amount_cents = _dollars_to_cents(elements[3])

        elif seg_id == "CAS" and current_service is not None:
            # Claim adjustment segment
            if len(elements) >= 4:
                group_code = elements[1]
                # CAS can have up to 6 adjustment triplets
                i = 2
                while i + 1 < len(elements):
                    reason = elements[i] if elements[i] else None
                    amount = _dollars_to_cents(elements[i + 1]) if i + 1 < len(elements) else 0
                    qty = int(elements[i + 2]) if i + 2 < len(elements) and elements[i + 2] else 0
                    if reason:
                        current_service.adjustments.append(
                            ServiceAdjustment(
                                group_code=group_code,
                                reason_code=reason,
                                amount_cents=amount,
                                quantity=qty,
                            )
                        )
                    i += 3

        elif seg_id == "DTM" and current_service is not None:
            qualifier = elements[1] if len(elements) > 1 else ""
            if qualifier == "472" and len(elements) > 2:
                current_service.date_of_service = _parse_date(elements[2])

        elif seg_id == "LQ" and current_service is not None:
            # Remark code
            if len(elements) > 2:
                current_service.remark_codes.append(elements[2])

    # Append last claim
    if current_claim is not None:
        result.claims.append(current_claim)

    return result


def era_to_denial_summaries(era: ParsedERA) -> list[dict]:
    """Convert parsed ERA into denial summary dicts matching the pipeline input format."""
    summaries = []
    for claim in era.claims:
        denial_codes = claim.denial_codes
        primary_code = denial_codes[0] if denial_codes else None

        summaries.append({
            "claim_id": claim.claim_id,
            "patient_name": claim.patient_name,
            "payer_name": claim.payer_name or era.payer_name,
            "denial_code": primary_code,
            "denial_codes_all": denial_codes,
            "remark_codes": claim.remark_codes,
            "amount_denied_cents": claim.total_denied_cents,
            "total_charge_cents": claim.total_charge_cents,
            "total_paid_cents": claim.total_paid_cents,
            "patient_responsibility_cents": claim.patient_responsibility_cents,
            "service_lines": [
                {
                    "procedure_code": svc.procedure_code,
                    "modifier": svc.modifier,
                    "charge_cents": svc.charge_amount_cents,
                    "paid_cents": svc.paid_amount_cents,
                    "date_of_service": svc.date_of_service.isoformat() if svc.date_of_service else None,
                    "adjustments": [
                        {"group": a.group_code, "reason": a.reason_code, "amount_cents": a.amount_cents}
                        for a in svc.adjustments
                    ],
                }
                for svc in claim.service_lines
            ],
        })
    return summaries
