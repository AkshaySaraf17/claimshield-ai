# ClaimShield — Build Status

Last updated: 2026-10-30

## Current phase: Pre-Phase 1 (Audit)

### Built and verified (by which test)

_None yet — audit complete, rebuild starting._

### Built, not verified

| Item | Notes |
|---|---|
| Landing page (hero, scroll showcase, process steps, feature grid, CTA) | Visual only; no automated tests |
| Dashboard with AppealWorkbench | Visual only; approval is UI-only, not server-enforced |
| LangGraph 3-agent pipeline (parser → researcher → writer) | Runs end-to-end but no test suite; parser hallucinates when unsure |
| Provider-agnostic LLM client (ollama, anthropic, openai, gemini) | Manual testing only |
| Supabase schema (db/schema.sql) | Never applied or tested; claims table never written to |

### Known issues (from ADR 000)

- Parser prompt encourages hallucination ("never leave blank")
- Human approval is UI-only, not server-enforced
- No auth, no persistence, no audit trail
- Money stored as float, not integer cents
- Frontend API route duplicates backend (must be removed)
- Researcher agent covers only 3 denial codes
- Zero tests, zero CI
