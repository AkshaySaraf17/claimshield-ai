"""Shared settings loaded from environment variables."""

from __future__ import annotations
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://claimshield:claimshield_dev@localhost:5432/claimshield"
    db_echo: bool = False
    valkey_url: str = "redis://localhost:6379/0"
    kafka_bootstrap_servers: str = "localhost:9094"
    keycloak_url: str = "http://localhost:8080"
    keycloak_realm: str = "claimshield"

    model_config = {"env_prefix": "CS_", "env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
