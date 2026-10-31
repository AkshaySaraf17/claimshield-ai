# ClaimShield — Build Status

Last updated: 2026-10-30

## Current phase: Phase 3–5 in progress

## Phase 1 — Foundation (Complete)

### Built and verified

| Item | Test |
|---|---|
| Integer-cent money type (`Cents`) | `test_money.py` — 5 tests |
| Multi-tenant context propagation | `test_tenancy.py` — 3 tests |
| Auth header extraction + role enforcement | `test_auth.py` — 3 tests (7 roles verified) |
| CloudEvent envelope | `test_events.py` — 3 tests |
| RFC 9457 problem+json responses | `test_problem.py` — 2 tests |
| Audit hash-chain integrity | `test_audit_hasher.py` — 4 tests |
| Docker Compose dev stack | Postgres 16+pgvector, Valkey, Kafka KRaft, Keycloak, Traefik, APISIX, Debezium, etcd |
| Docker Compose test stack | Separate project name, ports, tmpfs for speed |
| Keycloak realm + OIDC | 7 roles, 3 demo users, 2 clients, custom token mappers |
| APISIX API gateway | JWT validation, header forwarding (X-Tenant-Id, X-User-Id, X-User-Roles) |
| Postgres RLS policies | tenant_isolation on all tenant-scoped tables |
| Alembic migration 0001 | tenants, clinics, claims, appeals, policy_clauses, outbox, audit_log |
| SQLAlchemy ORM models | Integer cents, multi-tenant, mapped_column |
| Transactional outbox + Debezium CDC | outbox table → Kafka via Debezium connector |
| Audit service | Kafka consumer, append-only hash-chained writes, verify endpoint |
| GitHub Actions CI | Frontend lint/typecheck, Python lint, tests with Postgres, Semgrep + gitleaks |

## Phase 2 — Claims, Appeals, Rules Engine, Agent Pipeline (Complete)

### Built and verified

| Item | Test |
|---|---|
| Claims service (CRUD + status machine) | `test_claims_schemas.py` — 6 tests |
| Appeals service (draft, approve, send) | `test_appeals_schemas.py` — 2 tests |
| Server-enforced approval | /approve checks role server-side; /send blocks if needs_review=True |
| Rules engine (timely filing, denial codes, CCI bundling) | `test_rules_engine.py` — 10 tests; every rule has `source` field |
| Agent pipeline (parser → rule_checker → researcher → writer) | `test_agent_parser.py` — 3 tests; null + needs_review + confidence |
| Parser uses null (not hallucinations) | System prompt: "set to null if cannot determine" |
| Researcher covers 12 denial codes | Static KB with source citations |
| Provider-agnostic LLM client | ollama, anthropic, openai, gemini via httpx |

## Phase 3–5 — Policy, Auth, Frontend (In Progress)

### Built

| Item | Notes |
|---|---|
| Policy ingestion pipeline | Chunking (paragraph-boundary, 1500 chars, 200 overlap), embedding (ollama/openai) |
| Policy search | Text match now, pgvector-ready for semantic search |
| Keycloak auth for Next.js | AuthProvider context, OIDC login/logout, devLogin for local testing |
| Typed API client | claimsApi, appealsApi, pipelineApi with authFetch JWT wrapper |
| AppealWorkbench rebuilt | Server-enforced approval, confidence badges, rule results display, null field handling, integer cents |
| Synthetic test data generator | 10 denial scenarios, 6 payers, realistic EOBs and clinical notes |

### Total test count: 41 passing

### Known issues resolved

- ~~Parser hallucinates ("never leave blank")~~ → Rebuilt with null + needs_review + confidence
- ~~Human approval is UI-only~~ → Server-enforced: /approve checks role, /send blocks without approval
- ~~Researcher covers only 3 denial codes~~ → Expanded to 12 with source citations
- ~~Dashboard uses old API~~ → Rebuilt with typed API client, confidence scores, rule results

### Remaining phases

- Phase 3: 14-agent LangGraph supervisor graph (coding agent, bundling agent, medical necessity agent, etc.)
- Phase 4: EDI 835/837 parsing, full policy RAG with pgvector embeddings
- Phase 5: Complete frontend rebuild (claims list, audit viewer, tenant admin)
- Phase 6: Observability (OpenTelemetry, structured logging, alerting)
- Phase 7: Hardening (rate limiting, input sanitization, pen testing, load testing)
