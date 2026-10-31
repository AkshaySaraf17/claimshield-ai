# Setup & Running Instructions

## Prerequisites

- Node.js 18+
- Python 3.11+
- [Ollama](https://ollama.com) installed and running

Pull the local LLM model:

```bash
ollama pull llama3.2:3b
```

## Install dependencies

```bash
# python
python3 -m venv .venv && source .venv/bin/activate
pip install -e packages/py-common
pip install -r services/agents/requirements.txt 2>/dev/null || pip install fastapi 'uvicorn[standard]' langgraph httpx pydantic pydantic-settings aiosqlite

# frontend
cd apps/web && npm install && cd ../..
```

## Start services

Run each in its own terminal, or background them with `&`.

```bash
# 1. rules engine (port 8002)
PYTHONPATH="$PWD" uvicorn services.rules_engine.app.main:app --port 8002

# 2. agent pipeline (port 8001)
PYTHONPATH="$PWD" RULES_ENGINE_URL=http://localhost:8002 OLLAMA_MODEL=llama3.2:3b uvicorn services.agents.app.main:app --port 8001

# 3. dev server — claims, appeals, audit on SQLite (port 8003)
PYTHONPATH="$PWD" uvicorn services.dev_server.main:app --port 8003

# 4. frontend (port 3000)
cd apps/web && npm run dev
```

## Use it

Open [localhost:3000/dashboard](http://localhost:3000/dashboard).

1. Click **Dev login** (top right) to authenticate as a demo biller
2. Go to **Appeal Workbench**, paste a denial letter and clinical notes, click Generate
3. Go to **Claims** to see the 10 seeded demo claims
4. Go to **Audit Log** to see hash-chained entries and verify chain integrity

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

Local dev uses `dev_server` (SQLite, no Docker). Production uses the individual services with Postgres, Kafka, and Keycloak behind an API gateway.

## Running tests

```bash
PYTHONPATH="$PWD" python -m pytest tests/ -v
```

103 tests covering money types, tenancy, auth, rules engine, agent routing, EDI 835 parsing, observability, and security.

## Production stack

When you're ready to move past local dev:

```bash
cd infra/compose && docker compose -f dev.yml up -d
```

This starts Postgres (pgvector), Kafka (KRaft), Keycloak (OIDC with 7 roles), Valkey, Traefik, APISIX, and Debezium. The individual services connect to Postgres with row-level security and publish events through a transactional outbox.

## Before real patient data

This runs on synthetic data only. Before processing real denial letters:

- Sign a HIPAA BAA with your hosting and LLM providers
- Enable Keycloak auth (realm config is in `infra/keycloak/`)
- Switch from SQLite dev server to the Postgres-backed services
- Review rate limiting and security hardening in `claimshield_common.security`
