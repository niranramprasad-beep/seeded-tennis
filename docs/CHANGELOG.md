# Changelog

## 2026-11-10 — P1-SEC-1 + P1-SEC-5: delete the copilot and Stripe routes
- Deleted `/api/training/copilot` (Gemini), `components/training/training-copilot.tsx`, and the `applyCopilotActions`/`resolveCopilotTypeId` handlers that turned model JSON into real create/update/delete on a player's training sessions. The route had no tier check, no rate limit and no input cap on a paid provider call, returned raw provider errors to the client, and its prompt told the model to "make a reasonable default choice" and write sessions — which also broke the "no auto-generated training plans" rule.
- Deleted `/api/stripe/{checkout,portal,webhook}` and `lib/stripe.ts`. Billing is Whop only; these were live endpoints for an unused path. `profiles.stripe_*` columns kept until a cleanup migration (no code reads them).
- Uninstalled `stripe` and `@google/genai`. Removed both key families from `.env.example`, replaced with a note telling whoever prunes Vercel what's safe to delete.
- **Both keys still need revoking at the provider** — removing an env var doesn't invalidate a credential.
- Verified: `POST /api/training/copilot` → 404, `POST /api/stripe/checkout` → 404, `/training` → 200, build 134 → 130 pages.

## 2026-11-10 — P0-7: remove claims the product can't back up
- Homepage: "Rosters verified Oct 2026" → an "Unverified estimate" chip. "Every team rating shows its source and date" → "Team ratings that are estimates are labelled as estimates." "we fix it within 48 hours" → no turnaround promise. Parent stat card labelled "Example".
- "A Sunday email with…" → "A weekly report you can open any time." The report is real (`/family/weekly-reports`); only the sending was fiction. Seeded has no email provider — the only mail that leaves the system is Supabase Auth's own confirmation/reset.
- `/sample-report`: no longer claims it's sent every Sunday; dropped its "Email settings" link; "Verified Nov 3" → "Self-reported Nov 3".
- Settings: Notifications card **and** its nav tab hidden (five toggles wrote `user_settings` rows nothing read). "Public recruiting page" toggle hidden (no page, no video, no approval flow — and it wrote a real column, so a player could believe sharing was on when it wasn't).
- Delete account now describes what actually happens: a request a person actions by hand. Nothing deletes anything today. Two-step confirmation kept.
- Pricing: "Browse all D1 tennis programs" → "Browse 68 D1, D2 and D3 programs" (54/6/8, against ~1,100 real D1 programs).
- "UTR · verified {date}" → "· self-reported {date}" on Plan and `/tournament-fit`; `lastVerified` renamed `lastLoggedUtr` so the code doesn't mislead either.
- Methodology: replaced a confidence model keyed on a verification date that doesn't exist with a statement of where the data actually is.
- "compares you to real rosters" → "real programs" (hero, onboarding, and both pages' `metadata.description`).
- Removed the dead notification-prefs / public-page state that was fetching `user_settings` on every settings load for UI nobody renders. `lib/db/settings.ts` and `notifications-card.tsx` kept intact for POST-V1.
- Added `lib/copy-honesty.test.ts`: scans every shipped `.ts`/`.tsx` under `components/` and `app/` for all nine phrasings and fails the build. Verified it fires by reintroducing one and watching it fail.
- Tests: 398 → 408.

## 2026-11-10 — P0-4: the coach email only says what the player actually told us
- Removed the program's "competitive line" from the draft. It's an unverified estimate of ours (`minCompetitiveUTR`), and reciting it to the coach whose roster it describes asserts as fact a number we cannot source.
- Removed "my roadmap has me closing that gap well before I'd arrive on campus" and "I'll be at several events this spring and would be glad to play in front of your staff" — commitments the player never made, sent for every player including ones with nothing scheduled.
- Removed the "full sectional and national schedule" fallback used when the player had logged nothing; it now reports their own tournament count, or says nothing.
- Forward-looking statements derive from `tournamentsGoal` and are omitted entirely when it's 0.
- UTR travels labeled "(self-reported)" in the subject, body and signature.
- Flattened `WEAKNESS_PHRASES`: "turning my forehand into a genuine point-ending shot from the ad corner" → "my forehand". The player ticked a checkbox; the shot shape, court side and tactical intent were invented — data about the *player* this time, which is why it survived the first pass.
- Tests: 394 → 398, including the degenerate case where every optional sentence drops out (no orphaned punctuation or blank-line runs).

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
