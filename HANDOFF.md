# Handoff
Last updated: 2026-11-01 | Branch: main | Last commit: 861a5bf Add Java Spring Boot core API and document upload feature

## Project summary
ClaimShield AI is a healthcare claims denial management platform with 92 dashboard pages (Next.js 15, port 3000), a Python FastAPI monolith being migrated to Java Spring Boot microservices (core-api on port 8080), and a Python AI/ML agent service (port 8001, not migrating). All code lives in a monorepo: `apps/web/` (frontend), `services/core-api/` (Java), `services/dev_server/` (Python, being replaced), `services/agent_service/` (Python AI, stays).

## Current state

### Done and working
- **92 Next.js dashboard pages** with collapsible sidebar nav, Google OAuth + admin + dev login via NextAuth
- **Python dev_server** (`services/dev_server/main.py`): 5358 lines, 125 endpoints, 19 SQLAlchemy models — fully functional, serves all 99 frontend proxy routes on port 8003
- **Java core-api** (`services/core-api/`, port 8080): Spring Boot 3.2.5, Java 17, H2 file DB
  - **4 existing entities** with repos + controllers: `Claim`, `Appeal`, `AuditLog`, `Document`
  - **4 existing controllers**: `ClaimController` (list/get/create/patch/stats), `AppealController` (list/create/approve/send/by-claim), `AuditController` (list/by-resource), `DocumentController` (upload/list/by-claim/types)
  - **2 services**: `AuditService` (hash-chained SHA-256), `DocumentService` (PDFBox/POI text extraction)
  - **Config**: `SecurityConfig` (permitAll dev), `DataSeeder` (10 demo claims), `application.yml` (H2 file, CORS)
  - **Document upload** end-to-end working (drag-and-drop UI → Java backend → PDFBox/POI extraction)
  - Only 2 of 102 frontend proxy routes point to Java (documents/upload, documents/list); the other 99 still point to Python

### In progress (uncommitted)
- **11 new JPA entity files written** but NOT yet committed:
  - `Tenant.java`, `Clinic.java`, `ClaimNote.java`, `ClaimComment.java`, `ClaimAttachment.java`, `ClaimTag.java`, `ClaimAssignment.java`, `ClaimCost.java`, `ClaimLink.java`, `PayerResponse.java`, `ClaimStatusHistory.java`
  - All at `services/core-api/src/main/java/com/claimshield/core/model/`
- **Claim.java modified** with 5 new fields: `amountApprovedCents`, `rawDenialText`, `rawClinicalNotes`, `reviewedBy`, `reviewedAt`
- **No repositories or controllers exist yet** for any of the 11 new entities
- **Not compiled** — the new entities have not been verified with `mvn clean package`

### Broken or blocked
- Nothing is broken. The app runs fine with the existing 4 entities + Python fallback. The new entities are additive.

## Key decisions and context

1. **3-service architecture** (approved by user):
   - `core-api` (8080): Claims, Appeals, Audit, Documents, EDI 835, Reference — expanding existing service
   - `analytics-service` (8081): Read-only analytics/reports — new service, no own entities, reads shared DB
   - `workflow-service` (8082): Routing, assignments, preferences, contacts — new service, 8 new entities
2. **Shared H2 file database** in dev mode (`./data/claimshield`) for all 3 Java services
3. **Python agent service stays** (port 8001) — AI/ML pipeline not migrating
4. **Python dev_server gets decommissioned** after all endpoints are migrated to Java
5. **99 frontend proxy routes** in `apps/web/app/api/v1/` need updating from Python (port 8003) to the appropriate Java service
6. **Full migration plan** is in `.claude/plans/lazy-marinating-quasar.md` — 5 phases, approved by user
7. **No DTOs** — controllers return entities directly (matches existing pattern)
8. **No Lombok** — manual getters/setters throughout
9. **String UUID PKs, String foreign keys** — no JPA relationship annotations
10. **Project was moved** from `~/Downloads/claimshield-ai` to `~/Documents/claimshield-ai` — the working directory variable may still say Downloads but the git repo is in Documents

## Next steps (detailed plan)

### Phase 1: Expand core-api (port 8080)

**Step 1: Compile and verify new entities**
- Run `mvn clean package` in `services/core-api/` to confirm all 15 entity classes compile
- Files: all `*.java` under `services/core-api/src/main/java/com/claimshield/core/model/`
- Done when: `BUILD SUCCESS` with no errors
- No dependencies

**Step 2: Create Spring Data JPA repositories for 11 new entities**
- Create one `*Repository.java` interface per entity in `services/core-api/src/main/java/com/claimshield/core/repository/`
- Each extends `JpaRepository<EntityName, String>` with tenant-scoped query methods (e.g., `findByTenantId`, `findByTenantIdAndClaimId`)
- Files: `TenantRepository.java`, `ClinicRepository.java`, `ClaimNoteRepository.java`, `ClaimCommentRepository.java`, `ClaimAttachmentRepository.java`, `ClaimTagRepository.java`, `ClaimAssignmentRepository.java`, `ClaimCostRepository.java`, `ClaimLinkRepository.java`, `PayerResponseRepository.java`, `ClaimStatusHistoryRepository.java`
- Done when: `mvn clean package` passes
- Depends on: Step 1

**Step 3: Build CRUD controllers for claims sub-resources**
- Create controllers for Notes, Comments, Attachments, Tags, Costs, Links, Payer Responses, Status History
- Each provides GET (list by claim), POST (create), DELETE endpoints under `/api/v1/claims/{claimId}/...`
- Also create `TenantController` and `ClinicController` for basic CRUD
- Pattern: constructor-inject repository, read `X-Tenant-Id`/`X-User-Id` headers, audit via AuditService
- Reference: existing `ClaimController.java` for the pattern
- Done when: all endpoints return 200 on curl tests
- Depends on: Step 2

**Step 4: Build complex claims operations**
- Add to `ClaimController`: search, duplicates, export, CSV export, batch-transition, bulk-import, compare, merge, status transitions (port `ALLOWED_TRANSITIONS` map from Python), timeline, snapshot, priority-scores, workqueue, deadlines
- Port Python business logic from `services/dev_server/main.py` line-by-line: the status transition map, priority scoring formula, workqueue logic
- Done when: curl tests pass for each endpoint
- Depends on: Step 3

**Step 5: Expand appeals endpoints**
- Add to `AppealController`: preview, templates (port `APPEAL_TEMPLATES` from Python), letter generation (port `_generate_appeal_letter()`), batch letters
- Port reference data: `DENIAL_CODES`, `DENIAL_CODE_TO_CATEGORY`, `PAYER_FILING_DAYS`
- Create `ReferenceController` for denial-codes, denial-code-reference, denial-prevention-tips, rules/config
- Done when: appeal letter generation returns deterministic output matching Python behavior
- Depends on: Step 3

**Step 6: Port EDI 835 parser**
- Create Java equivalent of Python `edi835.py` parser
- Endpoints: POST `/api/v1/edi835/parse`, POST `/api/v1/edi835/import`
- Done when: parsing a sample EDI 835 file returns the same structured output as the Python version
- Depends on: Step 3

**Step 7: Expand DataSeeder**
- Seed all new entity types (notes, comments, tags, assignments, costs, etc.) alongside existing 10 demo claims
- Done when: starting the app populates all tables visible in H2 console
- Depends on: Steps 3-6

### Phase 2: Create workflow-service (port 8082)
- New Spring Boot project at `services/workflow-service/`
- 8 entities: RoutingRule, UserPreference, NotificationPreference, CustomTemplate, PayerContact, DashboardBookmark, ClaimWatchlist + reads ClaimAssignment from shared DB
- ~30 endpoints for routing, assignments, preferences, contacts, watchlists, bookmarks, alerts, escalations
- Depends on: Phase 1 complete

### Phase 3: Create analytics-service (port 8081)
- New Spring Boot project at `services/analytics-service/`
- Read-only, no own entities, ~25 GET endpoints for all analytics/reports
- Depends on: Phase 1 complete

### Phase 4: Update frontend proxy routes
- Change 99 routes in `apps/web/app/api/v1/` from Python (port 8003) to appropriate Java service
- Depends on: Phases 1-3 complete

### Phase 5: Decommission Python dev_server
- Remove Python dev_server once all routes verified
- Depends on: Phase 4 complete

## How to verify

```bash
# Check repo state
cd ~/Documents/claimshield-ai
git status
git log --oneline -5

# Build Java core-api
cd services/core-api && mvn clean package
# Healthy: BUILD SUCCESS

# Start Java core-api
cd services/core-api && mvn spring-boot:run
# Healthy: "Started CoreApiApplication" on port 8080

# Test existing endpoints
curl http://localhost:8080/api/v1/claims | jq '.[:1]'
# Healthy: returns array of claim objects with UUID ids

# Start frontend
cd apps/web && npm run dev
# Healthy: "Ready" on port 3000

# Start Python dev server (still needed)
cd services/dev_server && python main.py
# Healthy: "Uvicorn running on port 8003"
```

## History log

### 2026-11-01 — Initial handoff document
- Created CLAUDE.md with project rules and handoff protocol
- Created HANDOFF.md capturing full project state
- State: 11 new JPA entities written (uncommitted), no repos/controllers for them yet
- Migration plan approved: 5 phases, currently at Phase 1 Step 1
