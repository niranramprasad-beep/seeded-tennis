# docs/ — the index

Every document in `docs/`, one line each: what it is for and when to read
it. If a doc is not listed here, it should not exist — add it here in the
same commit, or move it to `archive/`.

**New here?** Read the root [`../README.md`](../README.md) (five minutes:
what Seeded is, how to run it, the rules that bite), then
[`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) (where things stand) and
[`REVIEWER_GUIDE.md`](REVIEWER_GUIDE.md) (a ten-minute code tour).

There is **one roadmap** (`MASTER_ROADMAP.md`), **one open-work list**
(`TODO.md`) and **one decisions log** (`DECISIONS.md`). Anything dated and
finished lives in `archive/`.

## Start here

| Doc | What it is for | Read it when |
|---|---|---|
| [../README.md](../README.md) | What Seeded is, stack, folders, setup, environments, the rules that bite | First |
| [../CLAUDE.md](../CLAUDE.md) | The rulebook (Always / Never / Non-negotiable) and the short list of enforced invariants; the long history is in `archive/` | Before changing code |
| [../AGENTS.md](../AGENTS.md) | The few things an AI agent most often gets wrong here | If you are an agent, after CLAUDE.md |
| [MASTER_ROADMAP.md](MASTER_ROADMAP.md) | Current status, open blockers, NEXT 10 tasks | To see what is live and what is next |
| [GROWTH.md](GROWTH.md) | Ideas for growing Seeded after the launch gates, each with what must exist first | When the P0/P1 list is clear and you are choosing what to build next |
| [TODO.md](TODO.md) | Every open item with its reasoning, grouped by area (owner steps first) | Before starting work in an area |
| [REVIEWER_GUIDE.md](REVIEWER_GUIDE.md) | Ten-minute tour: architecture, security model, fit engine, tests, ranked debt | Your first day |
| [DECISIONS.md](DECISIONS.md) | Every call made, newest first, with why and how to undo it | When something looks deliberate and odd |

## Product and data rules

| Doc | What it is for | Read it when |
|---|---|---|
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | What V1 is, for whom, and each feature's honest status | Before a product change |
| [DATA_QUALITY.md](DATA_QUALITY.md) | Where school, roster and UTR numbers come from and how they are labelled | Before touching schools, rosters, UTR or fit math |
| [CATALOG_EXPANSION.md](CATALOG_EXPANSION.md) | The plan for a sourced school catalog (phase 1 is live) | Before touching the catalog |
| [catalog/phase-1-import.md](catalog/phase-1-import.md) | Report of the phase-1 roster import; `lib/catalog/import-report.test.ts` reads it and `scripts/import-rosters.ts` writes it | When re-running the import |
| [catalog/phase-1-import.summary.json](catalog/phase-1-import.summary.json) | Machine-readable summary the importer writes next to the report | Only with the importer |
| [data/roster_counts_2026-27.tsv](data/roster_counts_2026-27.tsv) | Per-team roster counts by class (no player names); the importer's input, read by tests | When re-running the import |
| [data/expected_programs_2026-27.tsv](data/expected_programs_2026-27.tsv) | The 191 programs (conference, school, gender, source URL) the import report is checked against | When re-running the import |
| [legal/proposed-policy-edits.md](legal/proposed-policy-edits.md) | Proposed privacy-policy edits for the adult/lawyer review | Before changing `/privacy` or `/terms` |

## Architecture and database

| Doc | What it is for | Read it when |
|---|---|---|
| [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) | How it is built: frontend, backend, auth, environments, monitoring, known weaknesses | For depth beyond the reviewer guide |
| [diagrams/system-architecture.md](diagrams/system-architecture.md) | Mermaid diagram of the system | With the architecture doc |
| [diagrams/family-access-flow.md](diagrams/family-access-flow.md) | Mermaid diagram of family join, approval and access | Before touching family code |
| [DATABASE_SPEC.md](DATABASE_SPEC.md) | Tables, purpose, access, migration quirks (the repo does not rebuild production from `0001` alone) | Before a schema change |
| [API_INTEGRATIONS.md](API_INTEGRATIONS.md) | Every API route and external integration, with auth, validation and rate limits | Before adding or changing a route |

## Security

| Doc | What it is for | Read it when |
|---|---|---|
| [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) | RLS, RPC grants, headers, open findings, and what cannot be fixed in code | Before touching auth, RLS, profiles, family, billing or an API route |
| [STAGING_PERSONAS.md](STAGING_PERSONAS.md) | The fake staging accounts and how to act as one in SQL (as `authenticated`, rolled back) | Before probing or testing on staging |

## Shipping and runbooks

| Doc | What it is for | Read it when |
|---|---|---|
| [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) | Vercel/Supabase setup, branch protection, before/after every deploy, rollback | Before merging to `main` |
| [QA_CHECKLIST.md](QA_CHECKLIST.md) | Test strategy, the critical journeys, the RLS probe skeleton | Before shipping |
| [HANDOFF.md](HANDOFF.md) | **§J**: how to ship a migration to production, then every migration's verify and pasteable rollback (Steps 1–27). **§K**: the Whop billing incident and the dashboard steps | Before any production migration, during an incident, before touching Whop |
| [SEO_CHECKLIST.md](SEO_CHECKLIST.md) | What is in place for titles, sitemap, robots and school pages | Before adding a public page |
| [../scripts/README.md](../scripts/README.md) | The audit, persona and import scripts, and which may touch what | Before running a script |

## Design

| Doc | What it is for | Read it when |
|---|---|---|
| [DESIGN_MOCKUP_SPEC_V2.md](DESIGN_MOCKUP_SPEC_V2.md) | The UI spec (mockup boards 19–23, the eight design-system rules); polish round 1 follows a Figma file where they differ (DECISIONS 2026-11-22) | Before a UI change |
| [COPY_CUTS.md](COPY_CUTS.md) | Round-1 copy cuts, screen by screen (honesty labels are shortened, never cut) | Before changing page copy |
| [SCHOOL_LOGOS.md](SCHOOL_LOGOS.md) | Where each school logo came from, the rules for using one, and what copying it does and does not stop; `lib/school-logos.test.ts` reads it | Before adding, changing or showing a school logo |

## History (`archive/`)

Dated records, kept because later docs and migration comments cite them.
Not kept current — read each as "what was true on that date". Full list:
[archive/README.md](archive/README.md).

| Doc | What it is for | Read it when |
|---|---|---|
| [archive/ROADMAP_HISTORY.md](archive/ROADMAP_HISTORY.md) | The dated status log (append-only, newest first) and the 2026-11-10 audit's task lists | To see how something came to be; add a dated entry there when you ship |
| [archive/TODO_DONE.md](archive/TODO_DONE.md) | Done and obsolete TODO items, verbatim, with why each moved | When a TODO item seems to have vanished |
| [archive/GO-SEQUENCE.md](archive/GO-SEQUENCE.md) | The launch-day production order, one row per migration 022–052 | When a migration header cites a "GO-SEQUENCE row" |
| [archive/HANDOFF_HISTORY.md](archive/HANDOFF_HISTORY.md) | HANDOFF's old sections A–I (2026-11-10 snapshot) | Rarely |
| [archive/CLAUDE_INVARIANT_HISTORY.md](archive/CLAUDE_INVARIANT_HISTORY.md) | The long incident history behind CLAUDE.md's short rules (parents' writes, the UTR placeholder, every enforced invariant), moved verbatim 2026-11-26 | When a rule in CLAUDE.md needs its reason |
| Everything else in `archive/` | One-session reports, audits, prompts and the old mockup spec and changelog | When a doc cites one |
