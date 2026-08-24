# ClaimShield AI

Autonomous denial-appeal drafting for independent clinics. Three-agent
pipeline (parse → research → write) behind a FastAPI backend, with a
Next.js dashboard and human-in-the-loop review before anything is sent.

```
claimshield-ai/
  backend/     FastAPI + LangGraph agents      → see backend/README.md
  frontend/    Next.js 15 dashboard            → see frontend/README.md
  db/          Supabase schema (pgvector RAG)
```

## Quick start (two terminals)

```bash
# Terminal 1 — backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000/dashboard, paste a denial letter + clinical
notes, generate a draft.

For free local inference, also run `ollama serve` with `llama3` pulled
(see backend/README.md). Without it, agents fall back to clearly-labeled
placeholder text so you can still verify the pipeline wiring.

## What was fixed from the original implementation guide

1. **`langgraph.graph.StateMachine`/`State` don't exist.** Replaced with
   the real `StateGraph` + `TypedDict` API (verified against installed
   langgraph 1.2.11 and smoke-tested end to end — see backend/README.md).
2. **Agents were hardcoded stubs.** Now call a real, swappable LLM client
   (Ollama/Anthropic/OpenAI) with graceful fallback on failure.
3. **No frontend existed.** Built a working Next.js dashboard: intake form,
   loading state, error handling, editable letter, and an explicit
   human-approval gate — matching the doc's "Human-in-the-Loop Safeguards"
   requirement, not just naming it.
4. **RAG was fully simulated.** Static lookup table now, with the Supabase
   pgvector schema and search function already written in `db/schema.sql`
   and a clear extension point (`_search_supabase`) to swap in.

## Before this touches real patient data

Same warning as the original doc's Step 3, worth repeating: no auth/RBAC
layer exists yet, and the free-tier hosts here don't carry HIPAA BAAs by
default. Keep this on synthetic data through the sandbox phase, and treat
adding auth + a signed BAA with your hosting/LLM providers as a hard
blocker before any real denial letter goes through this pipeline.

## Open questions worth resolving before you build further

- PDF/image ingestion for denial letters — right now `denial_text` assumes
  OCR already happened upstream. Worth deciding: client-side extraction,
  or a server-side step (e.g. `pdfplumber` or a hosted OCR API)?
- Claim persistence — nothing writes to the `claims` table yet, so there's
  no audit trail or "no win, no fee" billing hook. Straightforward to add
  once you're happy with the pipeline output quality.
- Embedding model choice for `policy_clauses` — affects both the
  `vector(1536)` dimension in `db/schema.sql` and ongoing cost, since
  local-only embedding (e.g. via Ollama) keeps it free but hosted
  embeddings are usually higher quality for legal/regulatory text.
