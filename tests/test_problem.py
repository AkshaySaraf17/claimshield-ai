"""Tests for RFC 9457 problem+json responses."""

from claimshield_common.problem import ProblemDetail, problem_response


def test_problem_detail_model():
    p = ProblemDetail(title="Not Found", status=404, detail="Claim not found")
    assert p.status == 404
    assert p.title == "Not Found"


def test_problem_response():
    resp = problem_response(403, "Forbidden", detail="Insufficient role")
    assert resp.status_code == 403
    assert resp.media_type == "application/problem+json"
