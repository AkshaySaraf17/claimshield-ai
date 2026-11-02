# Handoff
Last updated: 2026-11-01 | Branch: phase5/java-api-parity | Last commit: Step 9 write-path fixes + sign-in required for writes (this branch)

## Project summary
ClaimShield AI is a healthcare claims denial management platform with 92 dashboard pages (Next.js 15, port 3000), a Java Spring Boot core-api (port 8080) with 15 entities, 17 controllers, and ~75 endpoints, Java analytics-service (8081) and workflow-service (8082), and a Python AI/ML agent service (port 8001, not migrating). The Python FastAPI dev_server (port 8003) was removed in Phase 5. Monorepo: `apps/web/` (frontend), `services/core-api/`, `services/analytics-service/`, `services/workflow-service/` (Java), `services/agent_service/` (Python AI, stays).

## Current state

### Done and working
- **92 Next.js dashboard pages** with collapsible sidebar nav, Google OAuth + admin + dev login via NextAuth
- **Python dev_server: REMOVED (Phase 5).** Original source is in git history at commit `0363fbb` (`git show 0363fbb:services/dev_server/main.py`)
- **Java analytics-service** (`services/analytics-service/`, port 8081): Spring Boot 3.2.5, read-only analytics — 10 model classes (copied from core-api), 7 repositories, 6 controllers, 25 GET endpoints covering stats, payer analytics, denial patterns, financials, team performance, reports, SLA, appeal effectiveness
- **Java core-api** (`services/core-api/`, port 8080): Spring Boot 3.2.5, Java 17, H2 file DB — **massively expanded this session**:
  - **15 JPA entities** (4 original + 11 new): Claim, Appeal, AuditLog, Document, Tenant, Clinic, ClaimNote, ClaimComment, ClaimAttachment, ClaimTag, ClaimAssignment, ClaimCost, ClaimLink, PayerResponse, ClaimStatusHistory
  - **15 Spring Data JPA repositories** (4 original + 11 new) — all at `services/core-api/src/main/java/com/claimshield/core/repository/`
  - **17 REST controllers** (4 original + 9 new + TagController, WorkspaceController added in Phase 4 gap fixes; see History log):
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
- **Phases 1–3 COMPLETE** (see History log)
- **Phase 4 was NOT actually complete when last handed off — fixed this session.** A static cross-check of every `fetch()` in `apps/web/app/api/**/route.ts` against every Java `@*Mapping` found 29 proxy routes calling paths that did not exist in any Java service, and all Java responses were camelCase while the 92 dashboard pages read snake_case keys (136 uses of `denial_code`/`amount_denied_cents`/etc., zero camelCase). Details in the 2026-11-01 "Phase 4 gap fixes" history entry
- **Phase 5 COMPLETE (code)** — `services/dev_server/` deleted; docs and docker-compose updated
- Committed and pushed on `phase5/java-api-parity`; PR open against main
- No files are half-written; all three Java services build and run together

### Broken or blocked
- **Unverified:** `docker-compose up` of the full file (images and shared volume were verified with `docker run`, see Step 8)
- **Partly verified:** write actions are verified via exact-payload replay through the proxy; only Batch Actions and Notification Preferences were clicked by hand in the browser
- **Known gap (pre-existing):** `ReferenceDataService.generateAppealLetter` uses `getOrDefault` on a map that contains null values, so missing fields print as "null" in letters instead of the default text

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

**Step 6: Decommission Python dev_server — Phase 5** — DONE (code). Verified: with nothing on port 8003, all 76 GET proxy routes return 200 through Next.js (`localhost:3000/api/v1/...`)

**Step 7: Commit and push branch `phase5/java-api-parity`, open PR** — DONE; next: review and merge the PR

**Step 8: Verify Docker compose stack** — DONE. All 3 images build from their Dockerfiles; run as containers on one network with a shared `/app/data` volume they start cleanly and share the H2 file (analytics `/api/v1/stats` shows core-api's 10 seeded claims; core-api auto-route reads workflow-service's `routing_rules`). Checked with `docker run` on host ports 18080-18082 because host 8080 was taken by another local project; the compose file itself was only validated with `docker-compose config`, not `up`

**Step 9: Exercise every dashboard write action** — DONE. All 53 write calls made by dashboard pages were inventoried; 36 replay checks (one per distinct action, using each page's exact request body) pass through the Next.js proxy as a signed-in reviewer, each verified by reading the data back; audit log credits the signed-in user and the hash chain stays valid. Clicked by hand in the browser: Batch Actions (two batches) and Notification Preferences (toggle persists across reload)

**Step 10: Role check on appeal approval** — DONE. `/api/v1/appeals/{id}/approve` returns 403 unless `X-User-Roles` contains reviewer, manager or admin; `approved_by` is always the authenticated caller (request-body value ignored). Proxy routes now forward the real NextAuth session identity (`apps/web/app/lib/identity.ts`) instead of the hardcoded dev-user-001/biller. "Dev Login as Reviewer" (dev-user-003, role reviewer) added to `/login`

## How to verify

```bash
cd ~/Documents/claimshield-ai

# Build Java core-api
cd services/core-api && mvn clean package
# Healthy: BUILD SUCCESS

# Start all three from ONE directory so they share ./data/claimshield (core-api first; it seeds)
rm -rf data && java -jar services/core-api/target/core-api-1.0.0.jar &
java -jar services/analytics-service/target/analytics-service-0.1.0.jar &
java -jar services/workflow-service/target/workflow-service-1.0.0.jar &
# Healthy: "Started CoreApiApplication" / "Started AnalyticsServiceApplication" / "Started WorkflowServiceApplication"

# Test key endpoints
curl -s http://localhost:8080/api/v1/claims | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'claims')"
curl -s http://localhost:8080/api/v1/claims/workqueue | python3 -c "import sys,json; print(json.load(sys.stdin)['total'], 'workqueue items')"
curl -s http://localhost:8080/api/v1/claims | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; print('payer_name' in c and 'denial_code' in c)"  # True = snake_case contract OK
curl -s http://localhost:8080/api/v1/audit/verify   # chain_valid: true
curl -s http://localhost:8080/api/v1/denial-codes | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'denial codes')"
curl -s http://localhost:8080/api/v1/rules/config | python3 -c "import sys,json; print('rules config OK')"
curl -s http://localhost:8080/api/v1/system/health
# Healthy: all return data, health returns {"status":"ok"}

# Start frontend
cd apps/web && npm run dev  # port 3000
```

## History log

### 2026-11-01 — Step 9: every write path fixed end to end + sign-in required for writes
- **Method:** extracted all 53 non-GET `fetch` calls from `apps/web/app/dashboard/**` and `components/`, replayed each page's exact body through `localhost:3000` with a NextAuth session cookie, then read the data back (Java silently drops unknown JSON fields, so 200 alone proves nothing)
- **Fixed (core-api `ClaimController`):** `/claims/batch-transition` reads `new_status` (pages; `status` still accepted) and returns `{results, transitioned, failed, errors}` (the batch pages read different keys); `/claims/merge` ported to Python's contract — `primary_claim_id` + `secondary_claim_ids[]` (old `primary_id`/`secondary_id` accepted), appends secondaries' denial text/clinical notes, marks them `cancelled`, writes notes on both sides, returns `{primary_id, merged_count, merged_ids}`
- **Fixed (routing rules):** workflow-service `RoutingRule` gains optional `match_payer`, `match_denial_code`, `min_amount_cents`, `max_amount_cents` (what `/dashboard/routing` sends and displays) and `assign_to_name`; generic `match_field/operator/value` now optional. core-api auto-route ANDs every condition a rule sets. NOTE: on an existing H2 file, `ddl-auto=update` does not drop the old NOT NULL on `match_field` — delete `data/` for a fresh schema
- **Fixed (notification prefs):** workflow-service `GET/PUT /notifications/preferences` now use Python's flat `{notif_*: "true"|"false"}` map with defaults (stored in the existing `notification_preferences` table); both notification pages were broken before
- **Fixed (frontend):** every DELETE proxy route used `resp.json()` on Java's 204 No Content → 502 in the UI even when the delete worked. New `apps/web/app/lib/proxy.ts` `relayJson()` used by all 6 DELETE routes. `dashboard/batch-actions` reset its status filter when the filtered status no longer exists (table showed empty after a batch)
- **Security:** `apps/web/middleware.ts` returns 401 for POST/PUT/PATCH/DELETE on `/api/v1/*` and `/api/backend/*` without a NextAuth session (before: anyone could write, recorded as `anonymous`). Reads stay open. Shared secret moved to `app/lib/authSecret.ts`
- **Verified:** 36/36 replay checks as signed-in reviewer; anonymous writes → 401; anonymous reads 200; 76 GET routes OK; `tsc` + `eslint` clean; audit chain valid (97 entries)

### 2026-11-01 — CI fixed (was failing on main too, for every commit)
- **Frontend lint & typecheck:** repo had no ESLint config, so `npx next lint` stopped at an interactive setup prompt and exited 1. `next lint` is also deprecated in Next 15. Added `apps/web/eslint.config.mjs` (flat config: `next/core-web-vitals` + `next/typescript`), devDeps `eslint@9`, `eslint-config-next@15.5.23`, `@eslint/eslintrc@3`; `npm run lint` is now `eslint .`. CI still runs `npx next lint`, which now finds the config and runs non-interactively (exit 0). Switching CI to `npm run lint` needs a push with the GitHub `workflow` scope, which the current sign-in token lacks — left as a follow-up. Fixed the 3 errors it found (unescaped apostrophes in `upload/page.tsx` and `login/page.tsx`; `<a>` → `<Link>` in `AppealWorkbench.tsx`). 19 warnings remain (mostly unused vars) — they don't fail CI
- **Python lint & typecheck:** 24 ruff errors in `packages/py-common` + `services/audit` (import order, unused imports, `datetime.UTC`, quoted annotations) fixed with `ruff check --fix` (models.py has `from __future__ import annotations`, so unquoting is safe) + `ruff format` on 9 files. No behaviour change
- **Python tests:** all 7 test modules failed at import (`No module named 'services'`) because CI ran pytest without the repo root on the path. Added root `pytest.ini` (`pythonpath = .`, `testpaths = tests`). 103 tests pass in a clean Python 3.12 venv with only CI's test-job installs

### 2026-11-01 — Full dashboard render sweep + response-shape fixes + Docker verified
- **Why:** the 76-route GET sweep only checked status codes and key style, so it missed missing fields. Loading every dashboard page in a browser found 8 crashing pages
- **Fixed (Java):** analytics `payer-performance` now returns `top_denial_codes` (top 5 per payer, as Python did); core-api `denial-prevention-tips` now returns Python's grouped shape `[{denial_code, occurrence_count, tips[], source}]` from the tenant's own denial codes (`ReferenceDataService.PREVENTION_TIPS` / `DEFAULT_PREVENTION_TIPS`); claim `/snapshot` adds `tags`, `costs_total_cents`, `total_cost_cents`, `attachments_count`; workflow-service `CustomTemplate` gains `sections` (JSON list), `source`, `body_template` (seeded templates have real citations); core-api DataSeeder's `seed.completed` audit now has resource `tenant/<tenantId>` instead of null
- **Fixed (frontend):** `dashboard/page.tsx`, `activity`, `audit`, `my-activity` no longer crash on null `resource_id`/`actor_id`; `custom-templates` proxy maps the page's `POST {_action:"delete", id}` to `DELETE /custom-templates/{id}` (previously created a blank template; Python had the same bug)
- **Result:** all 94 dashboard pages render with no runtime errors; all 3 Docker images build and share data via a volume (see Step 8)
- Correct stats path is `/api/v1/stats` (analytics-service), not `/api/v1/analytics/stats`

### 2026-11-01 — Step 10: server-enforced approval roles + real identity forwarding
- **Problem found:** all 98 Next.js proxy routes hardcoded `X-User-Id: dev-user-001` / `X-User-Roles: biller`, so every audit entry was attributed to the same user and no role check was possible. `documents/upload` took identity from browser-supplied headers (spoofable)
- `apps/web/app/lib/authOptions.ts` — NextAuth config moved out of `app/api/auth/[...nextauth]/route.ts` (route files may only export handlers) so server code can call `getServerSession(authOptions)`
- `apps/web/app/lib/identity.ts` — `identityHeaders(json?)` builds X-Tenant-Id / X-User-Id / X-User-Roles from the server-side session; unauthenticated → `anonymous` with no roles. All 98 routes + `documents/upload` use it (codemod; `npx tsc --noEmit` clean)
- New NextAuth provider `dev-reviewer-login` (dev-user-003 "Mike Chen (Dev Reviewer)", role reviewer) + "Dev Login as Reviewer" button on `/login`
- core-api `AppealController.approveAppeal`: 403 unless X-User-Roles (comma-separated, case-insensitive) contains reviewer/manager/admin; approver = caller
- **Verified end to end through Next.js with real NextAuth sessions:** anonymous → 403, biller → 403, biller with spoofed `X-User-Roles: reviewer` header → 403 (proxy ignores client headers), reviewer → 200 with `approved_by: dev-user-003`; audit shows `appeal.drafted` by dev-user-001 and `appeal.approved` by dev-user-003; all 76 GET proxy routes still 200
- Local gotcha: `colima start` auto-starts containers from other projects; one (`surette-nexus-gateway-1`, nginx) maps host port 8080, so `localhost:8080` hits nginx instead of core-api. Test core-api via `http://[::1]:8080` or stop that container
- Removed obsolete `version:` key from `docker-compose.dev.yml`

### 2026-11-01 — Phase 4 gap fixes + Phase 5 (dev_server removed)
Session started from another account; followed CLAUDE.md protocol (all 3 Java services built clean before changes).
- **Snake_case JSON contract:** added `spring.jackson.property-naming-strategy: SNAKE_CASE` to all 3 services; new `service/ClaimMapper.java` (snake_case claim map, mirrors Python `_claim_dict`), `ClaimController.claimToMap` delegates to it; `ReferenceDataService.generateAppealLetter` reads snake_case keys
- **Claim.payer** serializes as `payer_name` (`@JsonProperty("payer_name") @JsonAlias("payer")`) in core-api and the analytics-service copy
- **Appeal** gained columns `version` (default 1), `confidence`, `policy_evidence`, `template_used`; derived JSON `letter_text` (= letter_body) and `needs_review` (= status is draft); `@JsonAlias("letter_text")` on letterBody; id auto-generated in `@PrePersist`
- **core-api H2 URL** now `;AUTO_SERVER=TRUE` like the other two (it previously locked the shared file). Note: H2 rejects AUTO_SERVER together with DB_CLOSE_ON_EXIT=FALSE, so that flag was dropped
- **29 missing endpoints implemented** (all ported from Python dev_server):
  - `ClaimController`: GET `/claims/priority-scores`, POST `/claims/bulk`, POST `/claims/{id}/assign`, GET `/claims/{id}/predict` (deterministic, has `source`), POST `/claims/{id}/escalate`, POST `/claims/{id}/auto-route` (reads workflow-service `routing_rules` from shared DB via JdbcTemplate; priority DESC like workflow-service; operators equals/contains/starts_with/greater_than/less_than), GET `/claims/{id}/letter-history`, GET `/claims/{id}/appeal-versions`, GET `/claims/{id}/audit-trail`, GET+POST `/claims/{id}/links`; POST `/claims/appeal-letters/batch` now returns `{generated, errors, results}` and supports `save_as_draft` (drafts are needs_review)
  - `AppealController`: approve/send accept PATCH (frontend) and POST; 409 "Already approved" / 409 "must be approved before sending"; `approved_by` from body; GET `/appeals?claim_id&needs_review&limit&offset`; GET `/appeals/{id}/preview`
  - `AuditController`: GET `/audit/entries` (Python shape, parsed detail JSON), GET `/audit/verify` — via new `AuditService.verifyChain`, checks prev_hash links AND recomputes each SHA-256 (Python only checked links)
  - New `TagController` (`/api/v1/tags`): GET list, GET summary, POST batch, POST bulk-add, POST bulk-remove
  - New `WorkspaceController` (`/api/v1`): GET deadlines (days_remaining/is_overdue/urgency), assignments, calendar/deadlines, exports, my-activity
  - `ReferenceDataService`: TEAM_MEMBERS (same roster as workflow-service), HISTORICAL_WIN_RATES, PAYER_MODIFIER, LINK_TYPES, `filingDaysFor()`
- **Frontend routes repointed:** workqueue → `/claims/workqueue`; appeal-letters generate/batch → `/claims/appeal-letters/*`; assignments, calendar/deadlines, exports, my-activity moved from WORKFLOW_SERVICE_URL to JAVA_API_URL (data lives in core-api)
- **Phase 5:** deleted `services/dev_server/`; `docker-compose.dev.yml` now runs core-api/analytics-service/workflow-service with a shared `java-data` volume and passes JAVA_API_URL/ANALYTICS_SERVICE_URL/WORKFLOW_SERVICE_URL to web; added a Dockerfile per Java service (UNVERIFIED); SETUP.md and CLAUDE.md updated
- **Verification run:** static audit → 0 mismatches (only `/api/backend/appeal` → agent service, intentional). Live: 76 GET proxy paths 200 with no camelCase keys on all 3 services; write endpoints exercised (bulk, assign, escalate, auto-route matched "BCBS to Demo Biller", links, tags, letters, batch drafts); appeal flow send→409, approve→200, approve again→409, send→200; audit verify chain_valid=true; `npx tsc --noEmit` clean; Next.js dev with no Python on 8003 → all 76 GET proxy routes 200; `/dashboard/workqueue` renders seeded claims

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
