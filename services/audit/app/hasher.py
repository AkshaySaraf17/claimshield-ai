"""SHA-256 hash chain for audit integrity."""

from __future__ import annotations

import hashlib
import json


def compute_hash(
    prev_hash: str | None,
    tenant_id: str,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    detail: dict | None,
    timestamp: str,
) -> str:
    payload = json.dumps(
        {
            "prev_hash": prev_hash or "",
            "tenant_id": tenant_id,
            "actor_id": actor_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "detail": detail or {},
            "timestamp": timestamp,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()
