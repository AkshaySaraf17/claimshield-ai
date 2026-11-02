# Handoff
Last updated: 2026-11-01 | Branch: main | Last commit: pending (Phase 3)

## Project summary
ClaimShield AI is a healthcare claims denial management platform with 92 dashboard pages (Next.js 15, port 3000), a Java Spring Boot core-api (port 8080) with 15 entities, 14 controllers, and ~50 endpoints, a Python FastAPI monolith being replaced (port 8003), and a Python AI/ML agent service (port 8001, not migrating). Monorepo: `apps/web/` (frontend), `services/core-api/` (Java), `services/dev_server/` (Python, being replaced), `services/agent_service/` (Python AI, stays).

## Current state

### Done and working
- **92 Next.js dashboard pages** with collapsible sidebar nav, Google OAuth + admin + dev login via NextAuth
- **Python dev_server** (`services/dev_server/main.py`): 5358 lines, 125 endpoints — fully functional, still serves 99 frontend proxy routes on port 8003
- **Java analytics-service** (`services/analytics-service/`, port 8081): Spring Boot 3.2.5, read-only analytics — 10 model classes (copied from core-api), 7 repositories, 6 controllers, 25 GET endpoints covering stats, payer analytics, denial patterns, financials, team performance, reports, SLA, appeal effectiveness
- **Java core-api** (`services/core-api/`, port 8080): Spring Boot 3.2.5, Java 17, H2 file DB — **massively expanded this session**:
  - **15 JPA entities** (4 original + 11 new): Claim, Appeal, AuditLog, Document, Tenant, Clinic, ClaimNote, ClaimComment, ClaimAttachment, ClaimTag, ClaimAssignment, ClaimCost, ClaimLink, PayerResponse, ClaimStatusHistory
  - **15 Spring Data JPA repositories** (4 original + 11 new) — all at `services/core-api/src/main/java/com/claimshield/core/repository/`
  - **13 REST controllers** (4 original + 9 new):
    - `ClaimController` — expanded with: search, status transitions with ALLOWED_TRANSITIONS validation (409 on invalid), status-history, timeline, workqueue with urgency scoring, deadlines, batch-transition, duplicates detection, appeal letter generation + batch generation
    - `AppealController` — list, create, approve, send, by-claim
    - `AuditController` — list, by-resource
    - `DocumentController` — upload, list, by-claim, types
    - `ClaimNoteController` — list/create/delete per claim
    - `ClaimCommentController` — list/create/delete per claim (threaded via parentId)
    - `ClaimAttachmentController` — list/create/delete per claim
    - `ClaimTagController` — list/create/delete per claim + bulk add
    - `ClaimCostController` — list/create/delete per claim (Long cents)
    - `ClaimLinkController` — list/create/delete (bidirectional query)
    - `PayerResponseController` — list/create per claim
    - `TenantController` — list/get/create
    - `ClinicController` — list/get/create
    - `ReferenceController` — denial-codes (searchable), denial-code-reference, denial-prevention-tips, appeal-templates, rules/config, system/health
  - **4 services**: AuditService (hash-chained SHA-256), DocumentService (PDFBox/POI), ReferenceDataService (all reference data + appeal letter generator), Edi835ParserService (X12 835 parser ported from Python)
  - **Edi835Controller** — POST `/api/v1/edi835/parse` (structured JSON with payer, claims, service lines, adjustments, remark codes) and POST `/api/v1/edi835/import` (creates Claim entities from parsed EDI data with filing deadline computation)
  - **ClaimController expanded** with: export (JSON + CSV), bulk-import, compare, merge, snapshot (claim + notes + history + appeals + audit)
  - **DataSeeder** expanded: seeds 10 claims + tenant, 2 clinics, 10 notes, comments, tags, assignments, costs, status history entries
  - **All endpoints tested with curl** — status transitions, workqueue, timeline, letter generation, reference data, EDI 835 parse/import, export/CSV, bulk-import, compare, merge, snapshot all verified working
  - ~50 endpoints total in core-api

### In progress
- **Phase 1 COMPLETE** — all entities, controllers, services, EDI parser, and claim operations ported to Java
- **Phase 2 COMPLETE** — workflow-service (port 8082) created with 8 entities, 8 repositories, 8 controllers, ~25 endpoints, seed data
- **Phase 3 COMPLETE** — analytics-service (port 8081) created with 10 model copies, 7 repositories, 6 controllers, 25 GET endpoints
- **Phase 4 COMPLETE** — all 101 frontend proxy routes updated: 56 → core-api (8080), 25 → analytics-service (8081), 20 → workflow-service (8082)
- **Phase 5 next** — decommission Python dev_server (no longer needed for any frontend routes)
- No files are half-written; everything compiles and runs

### Broken or blocked
- Nothing is broken. Java and Python servers coexist. The 99 frontend routes still go to Python.

## Key decisions and context

1. **3-service architecture** (approved by user): core-api (8080), analytics-service (8081), workflow-service (8082)
2. **Shared H2 file database** in dev mode (`./data/claimshield`) for all Java services
3. **ReferenceDataService** holds all business constants (ALLOWED_TRANSITIONS, PAYER_FILING_DAYS, DENIAL_CODES, APPEAL_TEMPLATES, DENIAL_CODE_TO_CATEGORY) as static data — ported line-by-line from Python `services/dev_server/main.py` lines 107-1447
4. **Appeal letter generator** is deterministic (no LLM), template-based with 6 categories, each with a `source` field (regulatory citation). Ported from Python `_generate_appeal_letter()`.
5. **Status transition machine** enforces ALLOWED_TRANSITIONS map and records history in `claim_status_history` table. Invalid transitions return HTTP 409.
6. **Workqueue** priority scoring: filing deadline proximity (+50/+100), age (+15/+30), needs_review status (+20), pending appeal (+10), high value ≥$10k (+25)
7. **Controllers use `ResponseEntity<?>`** (not `ResponseEntity<Void>`) for delete methods to avoid Java generics inference issues with lambdas
8. **Project location**: `~/Documents/claimshield-ai` (moved from Downloads)
9. **Full migration plan** is in `.claude/plans/lazy-marinating-quasar.md`

## Next steps (detailed plan)

**Step 1: Port EDI 835 parser to Java** — DONE
**Step 2: Add remaining claim operations** — DONE

**Step 3: Create workflow-service (port 8082) — Phase 2** — DONE

**Step 4: Create analytics-service (port 8081) — Phase 3** — DONE

**Step 5: Update frontend proxy routes — Phase 4** — DONE

**Step 6: Decommission Python dev_server — Phase 5**
- Remove Python dev_server once all routes verified through Java
- Done when: Python server can be stopped and dashboard still works

## How to verify

```bash
cd ~/Documents/claimshield-ai

# Build Java core-api
cd services/core-api && mvn clean package
# Healthy: BUILD SUCCESS

# Start (delete data/ first for fresh seed)
rm -f data/claimshield.mv.db && mvn spring-boot:run
# Healthy: "Started CoreApiApplication" on port 8080, "Found 15 JPA repository interfaces"

# Test key endpoints
curl -s http://localhost:8080/api/v1/claims | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'claims')"
curl -s http://localhost:8080/api/v1/claims/workqueue | python3 -c "import sys,json; print(json.load(sys.stdin)['total'], 'workqueue items')"
curl -s http://localhost:8080/api/v1/denial-codes | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'denial codes')"
curl -s http://localhost:8080/api/v1/rules/config | python3 -c "import sys,json; print('rules config OK')"
curl -s http://localhost:8080/api/v1/system/health
# Healthy: all return data, health returns {"status":"ok"}

# Start frontend
cd apps/web && npm run dev  # port 3000
# Start Python (still needed for 99 routes)
cd services/dev_server && python main.py  # port 8003
```

## History log

### 2026-11-01 — Phase 4 complete: frontend proxy routes updated
- Updated all 101 Next.js API proxy routes in `apps/web/app/api/v1/`
- 56 routes → JAVA_API_URL (core-api, port 8080): claims, appeals, audit, documents, EDI, tags, etc.
- 25 routes → ANALYTICS_SERVICE_URL (analytics-service, port 8081): analytics/*, reports/*, stats
- 20 routes → WORKFLOW_SERVICE_URL (workflow-service, port 8082): routing-rules, preferences, watchlist, bookmarks, etc.
- Zero routes remain pointing to Python dev_server (port 8003)
- Environment variables: JAVA_API_URL, ANALYTICS_SERVICE_URL, WORKFLOW_SERVICE_URL

### 2026-11-01 — Phase 3 complete: analytics-service created
- Created `services/analytics-service/` Spring Boot project on port 8081
- Read-only service — no own entities, copies 10 model classes from core-api (Claim, Appeal, AuditLog, ClaimAssignment, ClaimCost, ClaimNote, ClaimComment, ClaimTag, Clinic, PayerResponse) with package rename
- 7 repositories: ClaimRepository, AppealRepository, AuditLogRepository, ClaimAssignmentRepository, ClaimCostRepository, ClinicRepository, PayerResponseRepository
- 6 controllers (25 GET endpoints):
  - StatsController: stats, quick-stats, status-distribution, scorecard, pipeline
  - PayerAnalyticsController: payers, payer-performance, payer-sla, payer-intelligence
  - PatternsController: patterns, denial-codes, heatmap, trends, aging
  - FinancialController: financials, recovery, cost-summary
  - TeamController: team-performance, workload, user-activity, clinics
  - ReportsController: reports/summary, reports/summary-text, appeal-effectiveness, sla, system/health
- All endpoints verified with curl — service builds and starts cleanly

### 2026-11-01 — Phase 2 complete: workflow-service created
- Created `services/workflow-service/` Spring Boot project on port 8082
- 8 JPA entities: RoutingRule, UserPreference, NotificationPreference, CustomTemplate, PayerContact, DashboardBookmark, ClaimWatchlist, Escalation
- 8 repositories, 8 controllers (~25 endpoints): routing-rules CRUD, preferences get/set, notification preferences, custom-templates CRUD, payer-contacts CRUD, watchlist CRUD, bookmarks CRUD, escalations create/list/resolve, team-members, roles, alerts, health
- DataSeeder seeds 4 routing rules, 2 templates, 3 payer contacts, 4 user preferences, 3 bookmarks
- All endpoints verified with curl

### 2026-11-01 — Phase 1 complete: EDI 835 parser + remaining claim ops
- Ported Python EDI 835 X12 parser to Java (`Edi835ParserService.java`) — handles ISA/GS/ST/BPR/TRN/N1/CLP/NM1/SVC/CAS/DTM/LQ segments, service adjustments, remark codes, all amounts in cents
- Created `Edi835Controller.java` with POST `/api/v1/edi835/parse` and `/import`
- Added claim operations: export (JSON + CSV), bulk-import, compare, merge, snapshot
- Fixed Claim entity to auto-generate UUID in `@PrePersist`
- All new endpoints verified with curl

### 2026-11-01 — Initial handoff + Phase 1 core-api expansion
- Created CLAUDE.md and HANDOFF.md with handoff protocol
- Committed 11 new JPA entities (Tenant, Clinic, ClaimNote, ClaimComment, ClaimAttachment, ClaimTag, ClaimAssignment, ClaimCost, ClaimLink, PayerResponse, ClaimStatusHistory) + expanded Claim entity
- Created 11 new Spring Data JPA repositories
- Created 9 new REST controllers: ClaimNoteController, ClaimCommentController, ClaimAttachmentController, ClaimTagController, ClaimCostController, ClaimLinkController, PayerResponseController, TenantController, ClinicController, ReferenceController
- Created ReferenceDataService with all business constants and appeal letter generator ported from Python
- Expanded ClaimController with: search, status transitions (ALLOWED_TRANSITIONS), status-history, timeline, workqueue (urgency scoring), deadlines, batch-transition, duplicates, appeal letter generation + batch generation
- Expanded DataSeeder to seed all new entity types (10 claims + tenant, 2 clinics, notes, comments, tags, assignments, costs, status history)
- All ~40 new endpoints verified working via curl
