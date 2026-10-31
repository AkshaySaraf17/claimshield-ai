"""Tests for the EDI 835 Electronic Remittance Advice parser."""

import pytest
from services.claims.app.edi835 import (
    parse_835,
    era_to_denial_summaries,
    _dollars_to_cents,
    _parse_date,
)
from datetime import date


SAMPLE_835 = (
    "ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *231015*1200*^*00501*000000001*0*P*:~"
    "GS*HP*SENDER*RECEIVER*20231015*1200*1*X*005010X221A1~"
    "ST*835*0001~"
    "BPR*I*1500.00*C*CHK************20231015~"
    "TRN*1*TRACE123*1234567890~"
    "N1*PR*Aetna Insurance~"
    "N1*PE*Synthetic Medical Group~"
    "CLP*CLM-001*1*2500.00*1500.00*500.00*MC~"
    "NM1*QC*1*DOE*JOHN~"
    "SVC*HC:99214*250.00*150.00~"
    "CAS*CO*50*100.00*0~"
    "DTM*472*20230901~"
    "LQ*HE*N115~"
    "SVC*HC:99213:59*200.00*0.00~"
    "CAS*CO*97*200.00*1~"
    "DTM*472*20230901~"
    "SE*15*0001~"
    "GE*1*1~"
    "IEA*1*000000001~"
)


class TestDollarsToCents:
    def test_basic(self):
        assert _dollars_to_cents("150.00") == 15000

    def test_zero(self):
        assert _dollars_to_cents("0") == 0

    def test_large_amount(self):
        assert _dollars_to_cents("12345.67") == 1234567

    def test_invalid(self):
        assert _dollars_to_cents("abc") == 0

    def test_empty(self):
        assert _dollars_to_cents("") == 0


class TestParseDate:
    def test_valid(self):
        assert _parse_date("20231015") == date(2023, 10, 15)

    def test_invalid(self):
        assert _parse_date("notadate") is None

    def test_empty(self):
        assert _parse_date("") is None

    def test_short(self):
        assert _parse_date("2023") is None


class TestParse835:
    def test_parses_payer(self):
        result = parse_835(SAMPLE_835)
        assert result.payer_name == "Aetna Insurance"

    def test_parses_payee(self):
        result = parse_835(SAMPLE_835)
        assert result.payee_name == "Synthetic Medical Group"

    def test_parses_check_number(self):
        result = parse_835(SAMPLE_835)
        assert result.check_number == "TRACE123"

    def test_parses_total_paid(self):
        result = parse_835(SAMPLE_835)
        assert result.total_paid_cents == 150000

    def test_parses_one_claim(self):
        result = parse_835(SAMPLE_835)
        assert len(result.claims) == 1

    def test_claim_id(self):
        result = parse_835(SAMPLE_835)
        assert result.claims[0].claim_id == "CLM-001"

    def test_claim_charges(self):
        result = parse_835(SAMPLE_835)
        c = result.claims[0]
        assert c.total_charge_cents == 250000
        assert c.total_paid_cents == 150000
        assert c.patient_responsibility_cents == 50000

    def test_claim_patient_name(self):
        result = parse_835(SAMPLE_835)
        assert result.claims[0].patient_name == "DOE, JOHN"

    def test_service_lines(self):
        result = parse_835(SAMPLE_835)
        assert len(result.claims[0].service_lines) == 2

    def test_service_procedure_codes(self):
        result = parse_835(SAMPLE_835)
        svcs = result.claims[0].service_lines
        assert svcs[0].procedure_code == "99214"
        assert svcs[1].procedure_code == "99213"
        assert svcs[1].modifier == "59"

    def test_service_amounts(self):
        result = parse_835(SAMPLE_835)
        svc = result.claims[0].service_lines[0]
        assert svc.charge_amount_cents == 25000
        assert svc.paid_amount_cents == 15000

    def test_adjustments(self):
        result = parse_835(SAMPLE_835)
        svc0 = result.claims[0].service_lines[0]
        assert len(svc0.adjustments) == 1
        assert svc0.adjustments[0].group_code == "CO"
        assert svc0.adjustments[0].reason_code == "50"
        assert svc0.adjustments[0].amount_cents == 10000

    def test_denial_codes(self):
        result = parse_835(SAMPLE_835)
        codes = result.claims[0].denial_codes
        assert "CO-50" in codes
        assert "CO-97" in codes

    def test_remark_codes(self):
        result = parse_835(SAMPLE_835)
        assert "N115" in result.claims[0].remark_codes

    def test_date_of_service(self):
        result = parse_835(SAMPLE_835)
        assert result.claims[0].service_lines[0].date_of_service == date(2023, 9, 1)

    def test_total_denied(self):
        result = parse_835(SAMPLE_835)
        c = result.claims[0]
        expected = c.total_charge_cents - c.total_paid_cents - c.patient_responsibility_cents
        assert c.total_denied_cents == expected


class TestEraToSummaries:
    def test_produces_summaries(self):
        era = parse_835(SAMPLE_835)
        summaries = era_to_denial_summaries(era)
        assert len(summaries) == 1

    def test_summary_fields(self):
        era = parse_835(SAMPLE_835)
        s = era_to_denial_summaries(era)[0]
        assert s["claim_id"] == "CLM-001"
        assert s["payer_name"] == "Aetna Insurance"
        assert s["denial_code"] == "CO-50"
        assert "CO-97" in s["denial_codes_all"]
        assert s["amount_denied_cents"] > 0
        assert len(s["service_lines"]) == 2

    def test_summary_service_line_detail(self):
        era = parse_835(SAMPLE_835)
        s = era_to_denial_summaries(era)[0]
        svc = s["service_lines"][0]
        assert svc["procedure_code"] == "99214"
        assert svc["charge_cents"] == 25000
        assert len(svc["adjustments"]) == 1
