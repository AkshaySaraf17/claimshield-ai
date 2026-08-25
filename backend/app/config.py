"""
Central configuration. All values are read from environment variables so the
same code runs unmodified against local Ollama or a hosted API provider.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- LLM provider ---
    # "ollama" for free local inference, "anthropic" or "openai" for hosted.
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-6"

    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"

    # --- Supabase ---
    supabase_url: str | None = None
    supabase_service_key: str | None = None

    # --- App ---
    cors_allow_origins: str = "http://localhost:3000,https://*.vercel.app,https://*.hf.space"


settings = Settings()
