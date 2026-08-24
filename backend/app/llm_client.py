"""
Provider-agnostic LLM client.

Swapping LLM_PROVIDER in .env between "ollama" (free/local), "anthropic",
and "openai" changes nothing else in the codebase — every agent just calls
`llm_client.complete(system, user)`.
"""
import json
import httpx
from app.config import settings


class LLMClient:
    async def complete(self, system: str, user: str, json_mode: bool = False) -> str:
        if settings.llm_provider == "ollama":
            return await self._ollama(system, user, json_mode)
        elif settings.llm_provider == "anthropic":
            return await self._anthropic(system, user, json_mode)
        elif settings.llm_provider == "openai":
            return await self._openai(system, user, json_mode)
        raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider}")

    async def _ollama(self, system: str, user: str, json_mode: bool) -> str:
        payload = {
            "model": settings.ollama_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
        }
        if json_mode:
            payload["format"] = "json"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
            resp.raise_for_status()
            return resp.json()["message"]["content"]

    async def _anthropic(self, system: str, user: str, json_mode: bool) -> str:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": settings.anthropic_model,
                    "max_tokens": 1500,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return "".join(b["text"] for b in data["content"] if b["type"] == "text")

    async def _openai(self, system: str, user: str, json_mode: bool) -> str:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        payload = {
            "model": settings.openai_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


llm_client = LLMClient()


def safe_json_parse(raw: str, fallback: dict) -> dict:
    """LLMs occasionally wrap JSON in markdown fences — strip those before parsing."""
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return fallback
