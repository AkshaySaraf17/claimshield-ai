"""Provider-agnostic LLM client — preserved from prototype, all providers work."""

from __future__ import annotations
import json
import httpx
from .config import get_settings


class LLMClient:
    async def complete(self, system: str, user: str, json_mode: bool = False) -> str:
        s = get_settings()
        if s.llm_provider == "ollama":
            return await self._ollama(s, system, user, json_mode)
        elif s.llm_provider == "anthropic":
            return await self._anthropic(s, system, user, json_mode)
        elif s.llm_provider == "openai":
            return await self._openai(s, system, user, json_mode)
        elif s.llm_provider == "gemini":
            return await self._gemini(s, system, user, json_mode)
        raise ValueError(f"Unknown LLM_PROVIDER: {s.llm_provider}")

    async def _ollama(self, s, system: str, user: str, json_mode: bool) -> str:
        payload = {
            "model": s.ollama_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False,
        }
        if json_mode:
            payload["format"] = "json"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{s.ollama_base_url}/api/chat", json=payload)
            resp.raise_for_status()
            return resp.json()["message"]["content"]

    async def _anthropic(self, s, system: str, user: str, json_mode: bool) -> str:
        if not s.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": s.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": s.anthropic_model, "max_tokens": 1500, "system": system, "messages": [{"role": "user", "content": user}]},
            )
            resp.raise_for_status()
            return "".join(b["text"] for b in resp.json()["content"] if b["type"] == "text")

    async def _openai(self, s, system: str, user: str, json_mode: bool) -> str:
        if not s.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        payload = {"model": s.openai_model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{s.openai_base_url.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {s.openai_api_key}"}, json=payload)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    async def _gemini(self, s, system: str, user: str, json_mode: bool) -> str:
        if not s.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY not set")
        payload = {"model": s.gemini_model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", headers={"Authorization": f"Bearer {s.gemini_api_key}"}, json=payload)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


llm_client = LLMClient()


def safe_json_parse(raw: str, fallback: dict) -> dict:
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return fallback
