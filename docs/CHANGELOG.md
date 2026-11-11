# Changelog

## 2026-11-10 — P0-3: fabricated school and coach data removed from the product
- Deleted `coachName`, `coachEmail`, `recruitingPageUrl`, `recentRecruits`, `programNote` and `conferenceRank` from the `School` type and all 68 catalog entries, plus the now-unused `Recruit` type. Removed, not hidden — nothing can render them again.
- School detail "Coaching staff" card: no name, no email. Shows "Not tracked" and a **web search** link for the program's staff directory (`staffDirectorySearchUrl`) — never a guessed athletics URL, which would be invented data too.
- Outreach composer: the "To" field now starts empty and is typed by the user, with the staff-directory link beside it. "Open in Gmail" is disabled until the address parses (`isValidEmailAddress`). Seeded stores no coach contacts.
- Coach email draft: salutation is "Coach," (the invented surname is gone); the invented conference-standing, program-blurb and recruit-footprint sentences are removed. The remaining unsupported first-person claims are P0-4.
- Roster UTR numbers now carry `UTR_RANGE_SOURCE_LABEL` ("Unverified estimate") on school detail, the Schools browser header and compare drawer, the Plan target list, and the Legacy stat tiles. The numbers themselves are unchanged — only labeled. Real sourced rosters are P1-DATA-1.
- Added `lib/db/schools-catalog-honesty.test.ts`: allowlist-based regression guard that fails the build on any re-added coach/recruit/rank field, email-shaped string, or URL in the catalog. Added `lib/utils.test.ts` for the recipient validator.
- Tests: 382 → 394 passing.

## 2026-11-10 — Production readiness audit (docs only, no app code changed)
- Added `docs/MASTER_ROADMAP.md` and the docs set (architecture, database, data quality, security, QA, deployment, API, product, SEO, decisions, diagrams).
- Added `supabase/migrations/022_lock_privileged_profile_columns.sql` — **written, not applied**.
- Updated `.env.example` to match what the code actually reads.
- Updated `CLAUDE.md` with the doc map, security rules, and current blockers.
- Added a correction banner to `docs/HANDOFF.md` ("Known bugs: none" and the RLS claims are no longer accurate).
- Found: production `main` is broken against the live DB (outreach `contacted` status) — MASTER_ROADMAP P0-5.
