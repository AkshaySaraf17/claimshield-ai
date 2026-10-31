"""Tests for hash-chain integrity in the audit service."""

from services.audit.app.hasher import compute_hash


def test_hash_deterministic():
    h1 = compute_hash(None, "t1", "actor1", "create", "claim", "c1", None, "2026-01-01T00:00:00Z")
    h2 = compute_hash(None, "t1", "actor1", "create", "claim", "c1", None, "2026-01-01T00:00:00Z")
    assert h1 == h2
    assert len(h1) == 64


def test_hash_chain():
    h1 = compute_hash(None, "t1", "actor1", "create", "claim", "c1", None, "2026-01-01T00:00:00Z")
    h2 = compute_hash(h1, "t1", "actor1", "update", "claim", "c1", {"status": "approved"}, "2026-01-01T00:01:00Z")
    assert h1 != h2
    assert len(h2) == 64


def test_different_tenant_different_hash():
    h1 = compute_hash(None, "t1", "actor1", "create", "claim", "c1", None, "2026-01-01T00:00:00Z")
    h2 = compute_hash(None, "t2", "actor1", "create", "claim", "c1", None, "2026-01-01T00:00:00Z")
    assert h1 != h2


def test_tamper_detection():
    h1 = compute_hash(None, "t1", "actor1", "create", "claim", "c1", None, "2026-01-01T00:00:00Z")
    h2 = compute_hash(h1, "t1", "actor1", "update", "claim", "c1", None, "2026-01-01T00:01:00Z")
    # If someone tampers with h1 in the chain, h2 won't validate against a re-derived prev
    h1_tampered = compute_hash(None, "t1", "actor1", "delete", "claim", "c1", None, "2026-01-01T00:00:00Z")
    h2_rederived = compute_hash(h1_tampered, "t1", "actor1", "update", "claim", "c1", None, "2026-01-01T00:01:00Z")
    assert h2 != h2_rederived
