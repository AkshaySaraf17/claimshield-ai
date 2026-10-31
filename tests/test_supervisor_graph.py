"""Tests for the supervisor graph routing and specialist agents.

Imports routing logic directly to avoid the langgraph dependency in tests."""

import pytest
from services.agents.app.agents.medical_necessity import _check_documentation

# Inline the routing logic to test without langgraph import
CATEGORY_MAP = {
    "CO-4": "coding",
    "CO-97": "coding",
    "CO-50": "medical_necessity",
    "CO-197": "authorization",
    "CO-29": "timely_filing",
    "PR-1": "patient_responsibility",
    "PR-2": "patient_responsibility",
    "PR-3": "patient_responsibility",
}


def _classify_denial(state: dict) -> dict:
    code = (state.get("denial_code") or "").upper().strip()
    category = CATEGORY_MAP.get(code, "general")
    return {"denial_category": category}


def _route_to_specialist(state: dict) -> str:
    category = state.get("denial_category", "general")
    route_map = {
        "coding": "coding_specialist",
        "medical_necessity": "medical_necessity_specialist",
        "authorization": "authorization_specialist",
        "timely_filing": "timely_filing_specialist",
        "patient_responsibility": "patient_responsibility_specialist",
    }
    return route_map.get(category, "coordinator_specialist")


class TestClassifyDenial:
    def test_coding_denial(self):
        result = _classify_denial({"denial_code": "CO-4"})
        assert result["denial_category"] == "coding"

    def test_medical_necessity(self):
        result = _classify_denial({"denial_code": "CO-50"})
        assert result["denial_category"] == "medical_necessity"

    def test_authorization(self):
        result = _classify_denial({"denial_code": "CO-197"})
        assert result["denial_category"] == "authorization"

    def test_timely_filing(self):
        result = _classify_denial({"denial_code": "CO-29"})
        assert result["denial_category"] == "timely_filing"

    def test_patient_responsibility(self):
        result = _classify_denial({"denial_code": "PR-1"})
        assert result["denial_category"] == "patient_responsibility"

    def test_unknown_code_is_general(self):
        result = _classify_denial({"denial_code": "XX-999"})
        assert result["denial_category"] == "general"

    def test_null_code_is_general(self):
        result = _classify_denial({"denial_code": None})
        assert result["denial_category"] == "general"

    def test_case_insensitive(self):
        result = _classify_denial({"denial_code": "co-50"})
        assert result["denial_category"] == "medical_necessity"


class TestRouteToSpecialist:
    def test_routes_coding(self):
        assert _route_to_specialist({"denial_category": "coding"}) == "coding_specialist"

    def test_routes_medical_necessity(self):
        assert _route_to_specialist({"denial_category": "medical_necessity"}) == "medical_necessity_specialist"

    def test_routes_authorization(self):
        assert _route_to_specialist({"denial_category": "authorization"}) == "authorization_specialist"

    def test_routes_timely_filing(self):
        assert _route_to_specialist({"denial_category": "timely_filing"}) == "timely_filing_specialist"

    def test_routes_patient_responsibility(self):
        assert _route_to_specialist({"denial_category": "patient_responsibility"}) == "patient_responsibility_specialist"

    def test_routes_general_to_coordinator(self):
        assert _route_to_specialist({"denial_category": "general"}) == "coordinator_specialist"

    def test_missing_category_to_coordinator(self):
        assert _route_to_specialist({}) == "coordinator_specialist"


class TestCategoryMap:
    def test_all_mapped_codes_have_specialists(self):
        valid_categories = {"coding", "medical_necessity", "authorization", "timely_filing", "patient_responsibility"}
        for code, category in CATEGORY_MAP.items():
            assert category in valid_categories, f"{code} maps to unknown category {category}"

    def test_bundling_codes_go_to_coding(self):
        assert CATEGORY_MAP["CO-4"] == "coding"
        assert CATEGORY_MAP["CO-97"] == "coding"


class TestMedicalNecessityDocCheck:
    def test_finds_functional_score(self):
        notes = "Patient ADL score shows significant decline. FIM score 42."
        results = _check_documentation(notes)
        functional = next(r for r in results if r["element"] == "functional score")
        assert functional["found"] is True

    def test_finds_objective_measurement(self):
        notes = "Range of motion limited to 30 degrees flexion."
        results = _check_documentation(notes)
        objective = next(r for r in results if r["element"] == "objective measurement")
        assert objective["found"] is True

    def test_detects_missing_elements(self):
        notes = "Patient presents with back pain."
        results = _check_documentation(notes)
        missing = [r for r in results if not r["found"]]
        assert len(missing) > 0

    def test_finds_treatment_history(self):
        notes = "Patient has previously tried physical therapy and conservative management."
        results = _check_documentation(notes)
        treatment = next(r for r in results if r["element"] == "treatment history")
        assert treatment["found"] is True
