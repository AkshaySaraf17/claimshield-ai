"""Tests for auth header extraction and role enforcement."""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from claimshield_common.auth import Role, TokenClaims, _extract_claims, require_role
from fastapi import HTTPException


def _mock_request(headers: dict):
    req = MagicMock()
    req.headers = headers
    return req


@pytest.mark.asyncio
async def test_extract_claims_from_headers(tenant_id):
    req = _mock_request({
        "X-Tenant-Id": str(tenant_id),
        "X-User-Id": "user-123",
        "X-User-Roles": "biller,coder",
        "X-User-Email": "test@example.com",
        "X-User-Name": "Test User",
    })
    claims = await _extract_claims(req)
    assert claims.sub == "user-123"
    assert claims.tenant_id == tenant_id
    assert Role.BILLER in claims.roles
    assert Role.CODER in claims.roles
    assert claims.email == "test@example.com"


@pytest.mark.asyncio
async def test_missing_headers_raises_401():
    req = _mock_request({})
    with pytest.raises(HTTPException) as exc_info:
        await _extract_claims(req)
    assert exc_info.value.status_code == 401


def test_all_roles_defined():
    expected = {"patient", "biller", "coder", "physician_reviewer", "clinic_admin", "auditor", "platform_admin"}
    assert {r.value for r in Role} == expected
