"""Tests for CloudEvent envelope and outbox entry."""

from claimshield_common.events import CloudEvent


def test_cloud_event_defaults():
    e = CloudEvent(source="claims-svc", type="claim.created.v1")
    assert e.source == "claims-svc"
    assert e.type == "claim.created.v1"
    assert e.datacontenttype == "application/json"
    assert e.id  # auto-generated UUID
    assert e.time  # auto-generated timestamp


def test_cloud_event_with_tenant():
    e = CloudEvent(
        source="claims-svc",
        type="claim.created.v1",
        tenantid="00000000-0000-0000-0000-000000000001",
        data={"claim_id": "abc123"},
    )
    assert e.tenantid == "00000000-0000-0000-0000-000000000001"
    assert e.data["claim_id"] == "abc123"


def test_cloud_event_serialization():
    e = CloudEvent(source="test", type="test.event.v1")
    d = e.model_dump()
    assert "id" in d
    assert "source" in d
    assert "type" in d
    assert "time" in d
