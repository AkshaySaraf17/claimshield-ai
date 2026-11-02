# ClaimShield — Build Status

Last updated: 2026-10-30

## All 7 phases complete. 103 tests passing.

## Phase 1 — Foundation (Complete)

| Item | Test |
|---|---|
| Integer-cent money type (`Cents`) | `test_money.py` — 5 tests |
| Multi-tenant context propagation | `test_tenancy.py` — 3 tests |
| Auth header extraction + role enforcement | `test_auth.py` — 3 tests (7 roles verified) |
| CloudEvent envelope | `test_events.py` — 3 tests |
| RFC 9457 problem+json responses | `test_problem.py` — 2 tests |
| Audit hash-chain integrity | `test_audit_hasher.py` — 4 tests |
| Docker Compose dev + test stacks | Postgres 16+pgvector, Valkey, Kafka KRaft, Keycloak, Traefik, APISIX, Debezium |
| Keycloak realm + OIDC | 7 roles, 3 demo users, 2 clients, custom token mappers |
| APISIX API gateway | JWT validation, header forwarding |
| Postgres RLS policies | tenant_isolation on all tenant-scoped tables |
| Alembic migration 0001 | tenants, clinics, claims, appeals, policy_clauses, outbox, audit_log |
| GitHub Actions CI | Frontend lint/typecheck, Python lint, tests, Semgrep + gitleaks |

## Phase 2 — Claims, Appeals, Rules Engine, Agent Pipeline (Complete)

| Item | Test |
|---|---|
| Claims service (CRUD + status machine) | `test_claims_schemas.py` — 6 tests |
| Appeals service (draft, approve, send) | `test_appeals_schemas.py` — 2 tests |
| Server-enforced approval | /approve checks role; /send blocks if needs_review=True |
| Rules engine (timely filing, denial codes, CCI bundling) | Ported to Java core-api (2026-11-01): `RulesEngineServiceTest` (10, one-to-one port) + `RulesEngineApiTest` (3); every rule has `source` |
| Agent pipeline (parser → rule_checker → researcher → writer) | `test_agent_parser.py` — 3 tests |
| Parser uses null (not hallucinations) | System prompt: "set to null if cannot determine" |
| Provider-agnostic LLM client | ollama, anthropic, openai, gemini via httpx |

## Phase 3 — Supervisor Agent Graph (Complete)

| Item | Test |
|---|---|
| Supervisor router with denial code classification | `test_supervisor_graph.py` — 21 tests |
| Coding & modifier specialist (CO-4, CO-97) | CCI edit checks, modifier justification |
| Medical necessity specialist (CO-50) | Documentation gap detection (functional scores, objective measures, treatment history, progression) |
| Authorization specialist (CO-197) | Auth number extraction, emergency exception detection |
| Timely filing specialist (CO-29) | Deadline calculation, proof-of-submission extraction |
| Patient responsibility specialist (PR-1/2/3) | Preventive care, OOP max, COB override detection |
| Coordinator (general/unknown codes) | CO-16, CO-18, CO-109, CO-242, OA-23, fallback |

## Phase 4 — EDI Parsing & Policy RAG (Complete)

| Item | Test |
|---|---|
| EDI 835 parser (remittance advice) | `test_edi835.py` — 28 tests |
| X12 segment parsing (ISA/GS/ST/BPR/TRN/CLP/SVC/CAS/DTM/LQ) | Extracts CARC/RARC codes, amounts, dates, patient info |
| ERA-to-denial-summary conversion | Produces pipeline-compatible input dicts |
| EDI 835 upload endpoint | POST /api/v1/claims/edi835 |
| pgvector semantic search | Cosine similarity on policy_clauses.embedding column |
| Embedding on ingest | ollama/openai providers, optional per-chunk embedding |
| Text match fallback | ILIKE search when embeddings unavailable |

## Phase 5 — Frontend Rebuild (Complete)

| Item | Notes |
|---|---|
| AppealWorkbench rebuilt | Server-enforced approval, confidence badges, rule results, null handling, integer cents |
| Claims list page | Status filters, pagination, denial code + amount display |
| Audit log viewer | Expandable entries, hash display, chain integrity verification button |
| Dashboard navigation | Top nav with auth state, dev login, role badge |
| AuthProvider + typed API client | Keycloak OIDC, authFetch JWT wrapper, claimsApi/appealsApi/pipelineApi |
| Synthetic test data generator | 10 denial scenarios, 6 payers, realistic EOBs and clinical notes |

## Phase 6 — Observability (Complete)

| Item | Test |
|---|---|
| Structured JSON logging | `test_observability.py` — 7 tests |
| Request logging middleware | Method, path, status, duration, tenant_id, user_id |
| OpenTelemetry integration | Optional OTEL SDK with OTLP exporter, FastAPI instrumentation |
| Trace context in logs | trace_id/span_id propagation when OTEL available |
| One-call setup | `setup_observability(app, service_name)` |

## Phase 7 — Security Hardening (Complete)

| Item | Test |
|---|---|
| Token bucket rate limiter | `test_security.py` — 6 tests; per-tenant, configurable rate/burst |
| Input size limiting | 10MB default, configurable per service |
| Security headers | X-Content-Type-Options, X-Frame-Options, XSS-Protection, Referrer-Policy, Permissions-Policy |
| CORS tightening | Explicit origins, restricted methods/headers |
| One-call setup | `setup_security(app, rate, burst, max_body_bytes, allowed_origins)` |

## Test Summary

| Test file | Count | Category |
|---|---|---|
| test_money.py | 5 | Money type |
| test_tenancy.py | 3 | Multi-tenancy |
| test_auth.py | 3 | Authentication |
| test_events.py | 3 | CloudEvents |
| test_problem.py | 2 | Error responses |
| test_audit_hasher.py | 4 | Audit chain |
| test_claims_schemas.py | 6 | Claims state machine |
| test_appeals_schemas.py | 2 | Appeals schemas |
| test_agent_parser.py | 3 | Agent parser |
| test_supervisor_graph.py | 21 | Supervisor routing |
| test_edi835.py | 28 | EDI 835 parsing |
| test_observability.py | 7 | Structured logging |
| test_security.py | 6 | Rate limiting |
| **Total** | **93** | (rules engine tests moved to Java) |
