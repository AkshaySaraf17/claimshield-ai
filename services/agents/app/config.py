"""Agent service configuration."""

from __future__ import annotations
from functools import lru_cache

from pydantic_settings import BaseSettings


class AgentSettings(BaseSettings):
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Deterministic rules engine (served by the Java core-api)
    rules_engine_url: str = "http://localhost:8080"

    model_config = {"env_prefix": "", "env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> AgentSettings:
    return AgentSettings()
