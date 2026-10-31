# ClaimShield — Build Status

Last updated: 2026-10-30

## Current phase: Phase 1 — Foundation (Complete)

### Built and verified (by which test)

| Item | Test |
|---|---|
| Integer-cent money type (`Cents`) | `test_money.py` — 5 tests |
| Multi-tenant context propagation | `test_tenancy.py` — 3 tests |
| Auth header extraction + role enforcement | `test_auth.py` — 3 tests (7 roles verified) |
| CloudEvent envelope | `test_events.py` — 3 tests |
| RFC 9457 problem+json responses | `test_problem.py` — 2 tests |
| Audit hash-chain integrity | `test_audit_hasher.py` — 4 tests (deterministic, chain, isolation, tamper detection) |

### Built, not yet integration-tested

| Item | Notes |
|---|---|
| Docker Compose dev stack | Postgres 16+pgvector, Valkey, Kafka KRaft, Keycloak, Traefik, APISIX, Debezium, etcd |
| Docker Compose test stack | Separate project name, ports, tmpfs for speed |
| Keycloak realm + OIDC | 7 roles, 3 demo users, 2 clients (public + confidential), custom token mappers |
| APISIX API gateway | JWT validation, header forwarding (X-Tenant-Id, X-User-Id, X-User-Roles) |
| Postgres RLS policies | tenant_isolation on clinics, claims, appeals, policy_clauses, audit_log |
| Alembic migration 0001 | Core schema: tenants, clinics, claims, appeals, policy_clauses, outbox, audit_log |
| SQLAlchemy ORM models | Tenant, Clinic, Claim, Appeal, AuditLog — integer cents, multi-tenant |
| Transactional outbox + Debezium CDC | outbox table, Debezium connector, Kafka topics |
| Audit service | FastAPI Kafka consumer, append-only hash-chained writes, verify endpoint |
| GitHub Actions CI | Frontend lint/typecheck, Python lint, tests with Postgres service, Semgrep + gitleaks |

### Carried from prototype (not yet rebuilt)

| Item | Notes |
|---|---|
| Landing page (hero, scroll showcase, process steps, feature grid, CTA) | Visual only; in apps/web |
| Dashboard with AppealWorkbench | Approval is UI-only — needs server enforcement |
| LangGraph 3-agent pipeline (parser → researcher → writer) | Parser hallucinates; needs null + needs_review + confidence |
| Provider-agnostic LLM client (ollama, anthropic, openai, gemini) | In backend/; needs migration to services/agents |

### Known issues (from ADR 000, partially addressed)

- ~~No auth~~ → Keycloak + APISIX + auth module built
- ~~No persistence~~ → Postgres + Alembic migrations built
- ~~No audit trail~~ → Append-only hash-chained audit service built
- ~~Money stored as float~~ → Integer cents (`Cents` class + `amount_denied_cents` column)
- ~~Frontend API route duplicates backend~~ → Removed in monorepo restructure
- ~~Zero tests, zero CI~~ → 20 tests passing, GitHub Actions CI configured
- Parser prompt encourages hallucination ("never leave blank") — Phase 2
- Human approval is UI-only, not server-enforced — Phase 2
- Researcher agent covers only 3 denial codes — Phase 2+
