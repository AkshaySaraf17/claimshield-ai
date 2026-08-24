# ClaimShield AI — Backend

FastAPI + LangGraph service that runs the three-agent pipeline (parse → research → write).

## What changed vs. the original doc

The doc's boilerplate imports `StateMachine` and `State` from
`langgraph.graph` — neither exists in the actual `langgraph` package. This
version uses the real API: `StateGraph`, a `TypedDict` state
(`app/schemas.py::AppealState`), `add_node`, `add_edge`, `set_entry_point`,
and `END`. It's confirmed to install and run (`pip show langgraph` →
1.2.11) and the graph was smoke-tested end to end before packaging.

The other structural change: agents now call a real LLM through
`app/llm_client.py` instead of returning hardcoded dicts. Set
`LLM_PROVIDER=ollama` in `.env` to run entirely free/local, or point it at
Anthropic/OpenAI with an API key. If the LLM call fails (e.g. Ollama isn't
running), each agent falls back to a clearly-labeled placeholder rather than
crashing the whole request — you'll see this in the parser's `UNKNOWN`
fields and the writer's `[DRAFT GENERATION FAILED: ...]` prefix.

## Local setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

### Option A — free local inference with Ollama

```bash
# in a separate terminal
ollama pull llama3
ollama serve
```

Leave `LLM_PROVIDER=ollama` in `.env`.

### Option B — hosted model

Set `LLM_PROVIDER=anthropic` (or `openai`) and fill in the matching API key
in `.env`.

### Run the server

```bash
uvicorn app.main:app --reload --port 8000
```

Check it's alive: `curl http://localhost:8000/api/health`

Test the pipeline:

```bash
curl -X POST http://localhost:8000/api/appeal \
  -H "Content-Type: application/json" \
  -d '{
    "denial_text": "Claim denied CO-50 not medically necessary by Anthem Blue Cross, amount 1250.00",
    "clinical_notes": "Patient shows mobility impairment score of 55, below the 70 threshold."
  }'
```

## Wiring up real RAG (Supabase pgvector)

1. Run `db/schema.sql` in your Supabase project's SQL editor.
2. Populate `policy_clauses` with embedded payer policy text (pick an
   embedding model — OpenAI `text-embedding-3-small` is a common free-tier
   choice — and adjust the `vector(1536)` dimension in the schema to match).
3. Fill in `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` in `.env`.
4. Implement `_search_supabase()` in `app/agents/researcher_agent.py` — it's
   stubbed to fall back to the static KB until you do. The `match_policy_clauses`
   SQL function is already defined in `db/schema.sql` for this.

## Project layout

```
backend/
  app/
    main.py           FastAPI app + routes
    graph.py           LangGraph wiring (the corrected part)
    schemas.py         AppealState (TypedDict) + API models
    config.py           env-based settings
    llm_client.py       provider-agnostic LLM wrapper (ollama/anthropic/openai)
    agents/
      parser_agent.py       denial letter -> structured JSON
      researcher_agent.py   denial code -> supporting policy evidence
      writer_agent.py       structured state -> appeal letter text
  requirements.txt
  .env.example
```

## Known gaps to close before this touches real patient data

- No auth/RBAC on the API yet — add before deploying past localhost.
- No PDF/image ingestion — `denial_text` currently assumes text is already
  extracted (e.g. via a PDF OCR step you add in `document_parser_agent`).
- No persistence — nothing is written to `claims` yet; add a Supabase insert
  in `main.py` after a successful run if you want an audit trail.
- Review the HIPAA note in the original doc's Step 3 — do not point this at
  real PHI until you've addressed BAAs with whichever hosts you use.
