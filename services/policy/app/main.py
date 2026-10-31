"""Policy service — ingest, chunk, embed, and search policy documents."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, Query
from pydantic import BaseModel
from sqlalchemy import select, text

from claimshield_common.auth import CurrentUser
from claimshield_common.db import create_engine, create_session_factory
from claimshield_common.tenancy import bind_tenant_to_session, set_current_tenant

from .embedder import chunk_text, embed_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_engine()
    app.state.session_factory = create_session_factory(engine)
    yield
    await engine.dispose()


app = FastAPI(title="ClaimShield Policy Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


class PolicyIngest(BaseModel):
    payer_name: str
    denial_code: str | None = None
    document_text: str
    source: str
    embed: bool = False
    embed_provider: str = "ollama"


class PolicyIngestResponse(BaseModel):
    chunks_created: int
    clause_ids: list[str]
    embedded: bool


@app.post("/api/v1/policy/ingest", response_model=PolicyIngestResponse, status_code=201)
async def ingest_policy(body: PolicyIngest, user: CurrentUser):
    """Chunk a policy document, optionally embed, and store clauses."""
    set_current_tenant(user.tenant_id)
    chunks = chunk_text(body.document_text)

    async with app.state.session_factory() as session:
        bind_tenant_to_session(session)
        ids = []
        for chunk in chunks:
            embedding = None
            if body.embed:
                try:
                    embedding = await embed_text(chunk, provider=body.embed_provider)
                except Exception as exc:
                    logger.warning("Embedding failed for chunk: %s", exc)

            if embedding:
                result = await session.execute(
                    text("""
                        INSERT INTO policy_clauses (tenant_id, payer_name, denial_code, clause_text, source, embedding)
                        VALUES (:tid, :payer, :code, :text, :source, :embedding)
                        RETURNING id
                    """),
                    {
                        "tid": str(user.tenant_id),
                        "payer": body.payer_name,
                        "code": body.denial_code,
                        "text": chunk,
                        "source": body.source,
                        "embedding": str(embedding),
                    },
                )
            else:
                result = await session.execute(
                    text("""
                        INSERT INTO policy_clauses (tenant_id, payer_name, denial_code, clause_text, source)
                        VALUES (:tid, :payer, :code, :text, :source)
                        RETURNING id
                    """),
                    {
                        "tid": str(user.tenant_id),
                        "payer": body.payer_name,
                        "code": body.denial_code,
                        "text": chunk,
                        "source": body.source,
                    },
                )
            row = result.fetchone()
            ids.append(str(row[0]))
        await session.commit()

    return PolicyIngestResponse(
        chunks_created=len(chunks),
        clause_ids=ids,
        embedded=body.embed,
    )


class PolicySearchRequest(BaseModel):
    denial_code: str | None = None
    query_text: str | None = None
    limit: int = 5
    use_semantic: bool = False
    embed_provider: str = "ollama"


@app.post("/api/v1/policy/search")
async def search_policies(body: PolicySearchRequest, user: CurrentUser):
    """Search policy clauses — text match or pgvector cosine similarity."""
    set_current_tenant(user.tenant_id)

    async with app.state.session_factory() as session:
        bind_tenant_to_session(session)

        # Semantic search with pgvector
        if body.use_semantic and body.query_text:
            try:
                query_embedding = await embed_text(body.query_text, provider=body.embed_provider)
                result = await session.execute(
                    text("""
                        SELECT id, payer_name, denial_code, clause_text, source,
                               1 - (embedding <=> :query_vec::vector) AS similarity
                        FROM policy_clauses
                        WHERE embedding IS NOT NULL
                        ORDER BY embedding <=> :query_vec::vector
                        LIMIT :lim
                    """),
                    {"query_vec": str(query_embedding), "lim": body.limit},
                )
                rows = result.fetchall()
                return [
                    {
                        "id": str(r[0]),
                        "payer_name": r[1],
                        "denial_code": r[2],
                        "clause_text": r[3],
                        "source": r[4],
                        "similarity": round(float(r[5]), 4) if r[5] else None,
                    }
                    for r in rows
                ]
            except Exception as exc:
                logger.warning("Semantic search failed, falling back to text: %s", exc)

        # Text match fallback
        if body.denial_code:
            result = await session.execute(
                text("""
                    SELECT id, payer_name, denial_code, clause_text, source
                    FROM policy_clauses
                    WHERE denial_code = :code
                    ORDER BY created_at DESC
                    LIMIT :lim
                """),
                {"code": body.denial_code, "lim": body.limit},
            )
        elif body.query_text:
            result = await session.execute(
                text("""
                    SELECT id, payer_name, denial_code, clause_text, source
                    FROM policy_clauses
                    WHERE clause_text ILIKE :pattern
                    ORDER BY created_at DESC
                    LIMIT :lim
                """),
                {"pattern": f"%{body.query_text}%", "lim": body.limit},
            )
        else:
            result = await session.execute(
                text("""
                    SELECT id, payer_name, denial_code, clause_text, source
                    FROM policy_clauses
                    ORDER BY created_at DESC
                    LIMIT :lim
                """),
                {"lim": body.limit},
            )

        rows = result.fetchall()
        return [
            {
                "id": str(r[0]),
                "payer_name": r[1],
                "denial_code": r[2],
                "clause_text": r[3],
                "source": r[4],
            }
            for r in rows
        ]
