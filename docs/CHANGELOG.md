# Changelog

## 2026-11-10 — Production readiness audit (docs only, no app code changed)
- Added `docs/MASTER_ROADMAP.md` and the docs set (architecture, database, data quality, security, QA, deployment, API, product, SEO, decisions, diagrams).
- Added `supabase/migrations/022_lock_privileged_profile_columns.sql` — **written, not applied**.
- Updated `.env.example` to match what the code actually reads.
- Updated `CLAUDE.md` with the doc map, security rules, and current blockers.
- Added a correction banner to `docs/HANDOFF.md` ("Known bugs: none" and the RLS claims are no longer accurate).
- Found: production `main` is broken against the live DB (outreach `contacted` status) — MASTER_ROADMAP P0-5.
