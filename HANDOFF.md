# Handoff
Last updated: 2026-11-01 | Branch: main | Last commit: 783f2f2 (pending new commit)

## Project summary
ClaimShield AI is a healthcare claims denial management platform with 92 dashboard pages (Next.js 15, port 3000), a Java Spring Boot core-api (port 8080) with 15 entities and 13 controllers, a Python FastAPI monolith being replaced (port 8003), and a Python AI/ML agent service (port 8001, not migrating). Monorepo: `apps/web/` (frontend), `services/core-api/` (Java), `services/dev_server/` (Python, being replaced), `services/agent_service/` (Python AI, stays).

## Current state

### Done and working
- **92 Next.js dashboard pages** with collapsible sidebar nav, Google OAuth + admin + dev login via NextAuth
- **Python dev_server** (`services/dev_server/main.py`): 5358 lines, 125 endpoints — fully functional, still serves 99 frontend proxy routes on port 8003
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
  - **3 services**: AuditService (hash-chained SHA-256), DocumentService (PDFBox/POI), ReferenceDataService (NEW — all reference data + appeal letter generator ported from Python)
  - **DataSeeder** expanded: seeds 10 claims + tenant, 2 clinics, 10 notes, comments, tags, assignments, costs, status history entries
  - **All endpoints tested with curl** — status transitions, workqueue, timeline, letter generation, reference data all verified working
  - ~40 new endpoints in this session

### In progress
- **Phase 1 nearly complete** — remaining: EDI 835 Java parser (Step 6), some secondary claim operations (export/CSV, bulk import, compare, merge, snapshot)
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

**Step 1: Port EDI 835 parser to Java**
- Create `services/core-api/src/main/java/com/claimshield/core/service/Edi835ParserService.java`
- Create `Edi835Controller.java` with POST `/api/v1/edi835/parse` and POST `/api/v1/edi835/import`
- Reference: Python parser at `services/dev_server/edi835.py`
- Done when: parsing a sample EDI 835 file returns structured JSON matching Python output

**Step 2: Add remaining claim operations**
- Export/CSV: GET `/api/v1/claims/export` and `/api/v1/claims/export/csv`
- Bulk import: POST `/api/v1/claims/bulk-import`
- Compare: POST `/api/v1/claims/compare`
- Merge: POST `/api/v1/claims/merge`
- Snapshot: GET `/api/v1/claims/{id}/snapshot`
- Done when: curl tests pass

**Step 3: Create workflow-service (port 8082) — Phase 2**
- New Spring Boot project at `services/workflow-service/`
- 8 entities: RoutingRule, UserPreference, NotificationPreference, CustomTemplate, PayerContact, DashboardBookmark, ClaimWatchlist + reads ClaimAssignment from shared DB
- ~30 endpoints for routing, assignments, preferences, contacts, watchlists, bookmarks, alerts, escalations
- Done when: `mvn clean package` passes and endpoints return data

**Step 4: Create analytics-service (port 8081) — Phase 3**
- New Spring Boot project at `services/analytics-service/`
- Read-only, no own entities, ~25 GET endpoints for all analytics/reports
- Reuse core-api entity classes (copy the model package)
- Done when: analytics endpoints return computed data from shared DB

**Step 5: Update frontend proxy routes — Phase 4**
- Change 99 routes in `apps/web/app/api/v1/` from Python (port 8003) to appropriate Java service
- analytics/* → port 8081, workflow/* → port 8082, everything else → port 8080
- Done when: all dashboard pages load data from Java services

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

### 2026-11-01 — Initial handoff + Phase 1 core-api expansion
- Created CLAUDE.md and HANDOFF.md with handoff protocol
- Committed 11 new JPA entities (Tenant, Clinic, ClaimNote, ClaimComment, ClaimAttachment, ClaimTag, ClaimAssignment, ClaimCost, ClaimLink, PayerResponse, ClaimStatusHistory) + expanded Claim entity
- Created 11 new Spring Data JPA repositories
- Created 9 new REST controllers: ClaimNoteController, ClaimCommentController, ClaimAttachmentController, ClaimTagController, ClaimCostController, ClaimLinkController, PayerResponseController, TenantController, ClinicController, ReferenceController
- Created ReferenceDataService with all business constants and appeal letter generator ported from Python
- Expanded ClaimController with: search, status transitions (ALLOWED_TRANSITIONS), status-history, timeline, workqueue (urgency scoring), deadlines, batch-transition, duplicates, appeal letter generation + batch generation
- Expanded DataSeeder to seed all new entity types (10 claims + tenant, 2 clinics, notes, comments, tags, assignments, costs, status history)
- All ~40 new endpoints verified working via curl
