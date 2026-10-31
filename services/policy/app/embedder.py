"""Text chunking and embedding for policy documents."""

from __future__ import annotations
import re


def chunk_text(text: str, max_chars: int = 1500, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks at paragraph boundaries."""
    paragraphs = re.split(r"\n\s*\n", text.strip())
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) + 2 > max_chars and current:
            chunks.append(current.strip())
            # Keep overlap from end of previous chunk
            current = current[-overlap:] if len(current) > overlap else current
        current += "\n\n" + para if current else para

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text.strip()]


async def embed_text(text: str, provider: str = "ollama", **kwargs) -> list[float]:
    """Get embedding vector for text. Supports ollama and OpenAI-compatible APIs."""
    import httpx

    if provider == "ollama":
        base_url = kwargs.get("base_url", "http://localhost:11434")
        model = kwargs.get("model", "nomic-embed-text")
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{base_url}/api/embeddings",
                json={"model": model, "prompt": text},
            )
            resp.raise_for_status()
            return resp.json()["embedding"]

    elif provider == "openai":
        api_key = kwargs.get("api_key", "")
        base_url = kwargs.get("base_url", "https://api.openai.com/v1")
        model = kwargs.get("model", "text-embedding-3-small")
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{base_url.rstrip('/')}/embeddings",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": model, "input": text},
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]

    raise ValueError(f"Unknown embedding provider: {provider}")
