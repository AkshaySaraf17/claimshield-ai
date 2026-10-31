"""Shared fixtures for Phase 1 tests."""

import uuid
import pytest


@pytest.fixture
def tenant_id():
    return uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture
def second_tenant_id():
    return uuid.UUID("00000000-0000-0000-0000-000000000002")
