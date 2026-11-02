# ClaimShield AI — CLAUDE.md

## What is this project?

ClaimShield AI is a healthcare claims denial management platform. It helps billing teams track denied claims, generate appeal letters, monitor payer performance, and manage workflows.

## Stack

- **Frontend:** Next.js 15 (App Router) at `apps/web/`, port 3000
- **Java backend:** Spring Boot 3.2.5 / Java 17 microservices: `services/core-api/` (port 8080), `services/analytics-service/` (8081), `services/workflow-service/` (8082)
- **Python dev_server:** removed in Phase 5 (2026-11-01); recover from git history (`git show 0363fbb:services/dev_server/main.py`) if you need to check original behaviour
- **Python AI/ML pipeline (stays):** `services/agent_service/` (port 8001) — NOT migrating
- **Database:** H2 file database in dev (`./data/claimshield`), shared by all Java services
- **Auth:** NextAuth with Google OAuth + admin credentials + dev login

## How to run

```bash
# Frontend
cd apps/web && npm run dev          # port 3000

# Java services: run all three from the same directory so they share ./data/claimshield
# (start core-api first: it seeds demo data)
java -jar services/core-api/target/core-api-1.0.0.jar               # port 8080
java -jar services/analytics-service/target/analytics-service-0.1.0.jar  # port 8081
java -jar services/workflow-service/target/workflow-service-1.0.0.jar    # port 8082
```

## Critical constraints

- **Deterministic code decides** (dates, money, codes, bundling); LLMs only draft/explain
- **Nothing sent without server-enforced human approval**
- **Synthetic data only** — no real PHI
- **Every healthcare rule needs a `source` field**
- **Parser must use null + `needs_review` + confidence**
- **Integer cents for money** (`amountCents`, `amountDeniedCents` as Long columns)

## Java patterns (follow exactly)

- String UUID primary keys, no auto-increment
- No Lombok — manual getters/setters
- No JPA relationship annotations — String foreign keys only
- `@PrePersist`/`@PreUpdate` for timestamps
- Header-based tenancy: `X-Tenant-Id` / `X-User-Id`
- Hash-chained audit via AuditService (SHA-256)
- Constructor injection (no `@Autowired` on fields)
- JSON is snake_case (`spring.jackson.property-naming-strategy=SNAKE_CASE`); hand-built maps must use snake_case keys too (see `ClaimMapper`). Claim's `payer` field serializes as `payer_name`

## Handoff protocol

Every session must follow this protocol:

### On session start
1. Read `HANDOFF.md` first
2. Confirm the current state matches the repo: `git status`, `git log --oneline -5`, run `mvn clean package` on Java services
3. Continue from "Next steps" in order. If the plan needs to change, update `HANDOFF.md` and explain why

### During work
- Update `HANDOFF.md` before every `git commit` and every `git push`, no exceptions
- Update after finishing any significant task or milestone
- Update whenever the user says "handoff", "wrap up", or mentions hitting a limit
- Update proactively when the conversation is getting long or usage may be running low — don't wait for a warning
- `HANDOFF.md` must be committed and pushed together with the code (same commit or follow-up commit in the same push)

### Honesty rules
- Do not redo work listed under "done"
- Do not fabricate progress — if something is unverified, mark it as unverified
- Be specific: file names, endpoint paths, line counts, not vague summaries
