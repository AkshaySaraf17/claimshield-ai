# ClaimShield AI

When a health insurance company denies a medical claim, the clinic has to write an appeal letter arguing why the denial was wrong. This takes billers hours per case — researching payer policies, checking filing deadlines, finding the right billing codes, and drafting a letter that addresses the specific reason for denial.

ClaimShield automates the research and drafting. A biller pastes the denial letter and clinical notes into the dashboard, and the system produces a ready-to-review appeal letter in seconds. The biller reviews it, edits if needed, and approves before anything gets sent. The AI drafts — humans decide.

## What it does

- **Reads denial letters** and extracts the denial code, reason, payer name, and denied amount
- **Checks billing rules** — timely filing deadlines, CCI bundling edits, modifier requirements, and payer-specific policies
- **Routes to a specialist** based on the denial type (medical necessity, coding, authorization, timely filing, patient responsibility)
- **Finds documentation gaps** — missing functional scores, absent auth numbers, insufficient treatment history
- **Pulls policy language** from a knowledge base to back up the argument
- **Writes the appeal letter** with a confidence score so the reviewer knows how much to trust it
- **Blocks sending until a human approves** — server-enforced, not just a UI checkbox

## Who it's for

Independent clinics and billing teams that handle their own denial appeals. The typical user is a medical biller who knows denial codes and payer rules but spends too much time on the writing and research part of each appeal.

## The dashboard

**Appeal Workbench** — the main tool. Paste a denial letter, see the parsed denial details, rule check results, and a generated appeal draft side by side. Approve or edit before sending.

**Claims** — a list of all claims in the system with their denial codes, payers, amounts, and current status (pending review, in progress, approved, sent, won, lost).

**Audit Log** — every action is recorded in an append-only, hash-chained log. Each entry links to the previous one cryptographically, so tampering is detectable. There's a one-click chain integrity verification.

## How the AI pipeline works

The system uses six specialized AI agents, each handling a different type of denial:

| Denial type | Example codes | What the agent does |
|---|---|---|
| Coding errors | CO-4, CO-97 | Checks CCI edits and modifier justification |
| Medical necessity | CO-50 | Looks for functional scores, objective measures, treatment history |
| Authorization | CO-197 | Finds auth numbers, checks for emergency exceptions |
| Timely filing | CO-29 | Calculates deadlines by payer, finds proof of submission |
| Patient responsibility | PR-1, PR-2, PR-3 | Checks preventive care rules, out-of-pocket max, coordination of benefits |
| General | Everything else | Broad documentation review |

The AI only drafts and explains. All date calculations, dollar amounts (stored as integer cents to avoid rounding errors), billing code lookups, and bundling decisions are handled by deterministic code — not the LLM.

## Tech stack

- **Frontend**: Next.js 15 with a clean dashboard UI
- **Agent pipeline**: Python + LangGraph with a supervisor routing graph
- **Rules engine**: Deterministic billing rules service
- **LLM**: Runs locally via Ollama (llama3.2) — no API keys needed for dev
- **Database**: SQLite for local dev, Postgres with pgvector for production
- **Auth**: Keycloak OIDC with 7 roles (patient, biller, coder, physician reviewer, clinic admin, auditor, platform admin)
- **Infrastructure**: Kafka for events, Debezium for CDC, APISIX gateway, row-level security

## Getting started

See [SETUP.md](SETUP.md) for installation and running instructions.

## Current status

This is running on synthetic data. See [SETUP.md](SETUP.md) for what's needed before processing real patient data.
