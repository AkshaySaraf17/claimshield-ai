"""Agent 1.5: Rule Checker — runs deterministic rules before the LLM researcher.

Calls the deterministic rules engine (served by the Java core-api). If there are
blockers, the pipeline flags needs_human_review and continues (the appeal will
require manual intervention)."""

from __future__ import annotations
import httpx
from ..config import get_settings
from ..schemas import AppealState


async def rule_checker_agent(state: AppealState) -> dict:
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{s.rules_engine_url}/api/v1/rules/check",
                json={
                    "payer_name": state.get("payer_name"),
                    "denial_code": state.get("denial_code"),
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "rule_results": data["results"],
                "has_rule_blockers": data["has_blockers"],
            }
    except Exception:
        return {
            "rule_results": [],
            "has_rule_blockers": False,
        }
