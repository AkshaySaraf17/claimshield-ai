# ClaimShield AI

Healthcare denial appeal platform. Paste a denial letter, get a draft appeal backed by payer policy and billing rules. Nothing gets sent without human approval.

## How it works

1. **Parser** reads the denial letter and extracts the code, reason, payer, and amount
2. **Rules engine** checks timely filing deadlines, CCI bundling edits, and payer-specific rules
3. **Classifier** routes the denial to a specialist (medical necessity, coding, authorization, timely filing, patient responsibility, or general)
4. **Specialist** analyzes documentation gaps and builds the clinical argument
5. **Researcher** pulls relevant policy language from a knowledge base
6. **Writer** drafts the appeal letter with a confidence score
7. **Human reviewer** approves or edits before anything is sent

The LLM drafts and explains. Deterministic code handles dates, money, billing codes, and bundling. Every dollar amount is stored as integer cents.

## Run it locally

You need: Node.js 18+, Python 3.11+, and [Ollama](https://ollama.com) with `llama3.2:3b` pulled.

```bash
ollama pull llama3.2:3b
```

Then from the project root:

```bash
# install python deps
python3 -m venv .venv && source .venv/bin/activate
pip install -e packages/py-common
pip install -r services/agents/requirements.txt 2>/dev/null || pip install fastapi 'uvicorn[standard]' langgraph httpx pydantic pydantic-settings aiosqlite

# install frontend deps
cd apps/web && npm install && cd ../..
```

Start four services (each in its own terminal, or use `&`):

```bash
# 1. rules engine
PYTHONPATH="$PWD" uvicorn services.rules_engine.app.main:app --port 8002

# 2. agent pipeline
PYTHONPATH="$PWD" RULES_ENGINE_URL=http://localhost:8002 OLLAMA_MODEL=llama3.2:3b uvicorn services.agents.app.main:app --port 8001

# 3. dev server (claims, appeals, audit — SQLite, no Docker needed)
PYTHONPATH="$PWD" uvicorn services.dev_server.main:app --port 8003

# 4. frontend
cd apps/web && npm run dev
```

Open [localhost:3000/dashboard](http://localhost:3000/dashboard). Click **Dev login**, paste a denial letter, hit Generate.

## Project layout

```
apps/web/                 Next.js 15 dashboard
services/
  agents/                 LangGraph agent pipeline (parser → specialist → writer)
  rules_engine/           Deterministic billing rules (timely filing, CCI, payer rules)
  dev_server/             Combined claims/appeals/audit API on SQLite
  claims/                 Claims service (Postgres, for production)
  appeals/                Appeals service (Postgres, for production)
  audit/                  Audit service with hash-chained log (Postgres + Kafka)
packages/py-common/       Shared Python: models, auth, tenancy, events
infra/compose/            Docker Compose for Postgres, Kafka, Keycloak, etc.
```

**Local dev** uses `dev_server` (SQLite, no Docker). **Production** uses the individual services with Postgres, Kafka, and Keycloak behind an API gateway.

## Dashboard pages

- **Appeal Workbench** — paste denial text + clinical notes, run the agent pipeline, review and approve the draft
- **Claims** — list of all claims with status, denial code, payer, amount, and filters
- **Audit Log** — hash-chained append-only entries with chain integrity verification

## Agent pipeline

Six specialized agents, routed by denial code:

| Denial codes | Specialist | What it checks |
|---|---|---|
| CO-4, CO-97 | Coding | CCI edits, modifier justification |
| CO-50 | Medical necessity | Functional scores, objective measures, treatment history |
| CO-197 | Authorization | Auth numbers, precert, emergency exceptions |
| CO-29 | Timely filing | Filing deadlines by payer, proof of submission |
| PR-1, PR-2, PR-3 | Patient responsibility | Preventive care, OOP max, COB |
| Everything else | Coordinator | General analysis and documentation review |

## Production stack

When you're ready to move past local dev:

```bash
cd infra/compose && docker compose -f dev.yml up -d
```

This starts Postgres (pgvector), Kafka (KRaft), Keycloak (OIDC with 7 roles), Valkey, Traefik, APISIX, and Debezium. The individual claim/appeal/audit services connect to Postgres with row-level security and publish events through a transactional outbox.

## Before real patient data

This runs on synthetic data only. Before processing real denial letters:

- Sign a HIPAA BAA with your hosting and LLM providers
- Enable Keycloak auth (the realm config is already in `infra/keycloak/`)
- Switch from SQLite dev server to the Postgres-backed services
- Review the rate limiting and security hardening in `claimshield_common.security`

## Tests

```bash
cd /path/to/claimshield-ai
PYTHONPATH="$PWD" python -m pytest tests/ -v
```

103 tests covering money types, tenancy, auth, rules engine, agent routing, EDI 835 parsing, observability, and security.
