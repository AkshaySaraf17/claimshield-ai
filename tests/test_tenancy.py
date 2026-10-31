"""Tests for tenant context propagation."""

import uuid
import pytest
from claimshield_common.tenancy import get_current_tenant, set_current_tenant, clear_tenant


def test_set_and_get_tenant(tenant_id):
    set_current_tenant(tenant_id)
    assert get_current_tenant() == tenant_id
    clear_tenant()


def test_no_tenant_raises():
    clear_tenant()
    with pytest.raises(RuntimeError, match="No tenant context"):
        get_current_tenant()


def test_tenant_isolation(tenant_id, second_tenant_id):
    set_current_tenant(tenant_id)
    assert get_current_tenant() == tenant_id

    set_current_tenant(second_tenant_id)
    assert get_current_tenant() == second_tenant_id
    clear_tenant()
