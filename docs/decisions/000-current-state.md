# ADR 000: Current State Audit

**Status:** Accepted  
**Date:** 2026-10-30  
**Context:** Audit the existing prototype before rebuilding as a multi-tenant SaaS platform.

---

## What exists

The repo contains a working prototype with two main parts:

### Backend (`backend/`)
- **FastAPI app** (`app/main.py`) — two endpoints: `GET /api/health`, `POST /api/appeal`
- **LangGraph StateGraph** (`app/graph.py`) — linear pipeline: parser → researcher → writer → END
- **Provider-agnostic LLM client** (`app/llm_client.py`) — supports ollama, anthropic, openai, gemini via httpx
- **Pydantic config** (`app/config.py`) — pydantic-settings reading from `.env`
- **Three agents:**
  - `parser_agent.py` — LLM extracts denial_code, denial_reason, payer_name, amount_denied
  - `researcher_agent.py` — static 3-entry lookup (CO-50, CO-97, CO-16)
  - `writer_agent.py` — LLM drafts appeal letter from accumulated state
- **Schemas** (`app/schemas.py`) — AppealState TypedDict, IngestionPayload, DenialSummary, AppealResponse
- **Supabase schema** (`db/schema.sql`) — clinics, claims, policy_clauses tables with pgvector

### Frontend (`frontend/`)
- **Next.js 15 App Router** with Tailwind CSS, custom color palette (ink, ledger, denial, parchment)
- **Landing page** (`app/page.tsx`) — hero, scroll showcase, process steps, feature grid, CTA
- **Dashboard** (`app/dashboard/page.tsx`) — renders AppealWorkbench
- **AppealWorkbench** — two-column layout, intake form + review panel, Framer Motion interactions
- **ScrollShowcase** — GSAP ScrollTrigger 3D card animation with phases
- **ProcessSteps** — 3-step "how it works" with SVG icons
- **FeatureGrid** — 6 features with search/filter, scroll-morphing search bar
- **API routes** (`app/api/appeal/route.ts`, `app/api/health/route.ts`) — duplicate of Python backend, calls Gemini directly

### What's sound (keep and migrate)
1. **LangGraph StateGraph pattern** — correct use of the real API, compilable graph
2. **Provider-agnostic LLM client** — clean abstraction, easy to extend
3. **Pydantic-settings config** — env-based, works across environments
4. **Frontend visual design** — polished landing page with custom SVG work, animations, responsive layout

---

## Issues found (all confirmed)

### Critical: Safety and correctness

| # | Issue | Location | Severity |
|---|---|---|---|
| 1 | **Parser tells LLM to guess ("never leave a field blank")** | `parser_agent.py:17` | Critical — for billing, unknown must be null + `needs_review`, not a hallucinated value |
| 2 | **Human approval is UI-only** | `AppealWorkbench.tsx:110-128` — checkbox enables a placeholder button; nothing is stored or enforced server-side | Critical — violates "nothing sent without server-enforced approval" |
| 3 | **No auth** | No Keycloak, no JWT, no sessions, no roles | Critical for multi-tenant |
| 4 | **No persistence** | The `claims` table in `db/schema.sql` is never written to; denials and appeals exist only in memory during a request | Critical — no audit trail |
| 5 | **`amount_denied` is a float** | `schemas.py:20`, `schemas.py:35` | Money must be integer cents to avoid rounding errors |

### Significant: Architecture and duplication

| # | Issue | Location |
|---|---|---|
| 6 | **Frontend API route duplicates Python backend** | `frontend/app/api/appeal/route.ts` — 173 lines reproducing the same prompts and pipeline, hardcoded to Gemini only. Must be removed; all AI goes through backend services |
| 7 | **Researcher is a 3-entry static dict** | `researcher_agent.py:13-30` — covers only CO-50, CO-97, CO-16. No RAG, no policy corpus |
| 8 | **No deterministic checks** | The prompt says categories A-H need deterministic rules (NCCI edits, NPI validation, deadline math). Currently everything is LLM-only |
| 9 | **Single monolithic endpoint** | `POST /api/appeal` does everything in one request — no job queue, no SSE progress, no resumability |
| 10 | **No Supabase writes** | `_search_supabase()` is a stub that falls back to static dict |
| 11 | **No tests** | Zero test files anywhere in the repo |
| 12 | **No CI** | No GitHub Actions workflow |
| 13 | **CORS allows all methods/headers** | `main.py:18-19` — `allow_methods=["*"], allow_headers=["*"]` |

### Minor: Code quality

| # | Issue | Location |
|---|---|---|
| 14 | **Deployment artifacts for abandoned platforms** | `render.yaml`, `vercel.json`, `backend/Dockerfile`, `backend/runtime.txt` — leftovers from deployment exploration; will be replaced by compose |
| 15 | **`.env` committed** | `backend/.env` is in the repo (gitignore has `.env` but the file predates it or was force-added) |
| 16 | **Supabase dependency unused** | `requirements.txt` includes `supabase==2.9.1` but nothing uses it beyond the stub |
| 17 | **No error schema** | Errors are bare `{"detail": "..."}` not RFC 9457 problem+json |

---

## Decision

Rebuild the project from Phase 1 of the build prompt. Preserve:
- The LangGraph `StateGraph` compilation pattern (migrate to new service structure)
- The provider-agnostic LLM client (extend with structured output validation)
- The frontend visual identity and component design (migrate to shadcn/ui + design tokens)

Delete or replace:
- `frontend/app/api/appeal/route.ts` and `frontend/app/api/health/route.ts` (duplicated backend)
- `render.yaml`, `vercel.json`, `backend/Dockerfile`, `backend/runtime.txt` (deployment artifacts)
- The parser prompt's "never leave blank" instruction
- Float-based money fields
- The UI-only approval checkbox

The new structure follows the monorepo layout in Section 4 of the build prompt.

---

## Consequences

- Existing prototype endpoints will break during migration
- The frontend will need to be rewired to talk through the API gateway
- All data models change (float → integer cents, new fields, new tables)
- The simple 3-agent pipeline becomes a supervisor graph with 14 agents
