# Changelog

## 2026-11-14 — Staging exists; P0-1, P0-2 and the pricing gates applied and attack-tested there
- **Staging is real.** Adopted the second Supabase project (`gnlcpnsweqbtwpaqhqqg`) after verifying it was genuinely empty — 0 tables, 0 auth users, 0 storage, no migrations table. (The earlier `28P01` auth failures were a stale DB password; resetting it fixed the tooling's own connection, so no credential had to be copied anywhere.)
- Applied all 23 of production's migrations to it **in production's real order** — which is not the repo's numbering: prod ran `019_rls_policy_hardening` *before* `018_revoke_anon_execute_security_definer`.
- Verified with a nine-category schema fingerprint (columns, constraints, policies, indexes, triggers, functions, function grants, table grants, RLS flags). **All nine now match production exactly.**
- **Recovered a lost migration.** P1-OPS-3 listed two migrations live on prod with no repo file. Diffing function grants showed exactly one real statement was missing — `revoke execute on function public.set_updated_at() from authenticated` — and that the other (`rls_auto_enable_revoke_direct_grants`) needs no content, because `020` already does those revokes and `rls_auto_enable` is a Supabase platform default present on a brand-new empty project.
- **The repo did not reproduce production.** `0001_init.sql` creates `profiles` loosely and `001_initial_saas_schema.sql`'s `create table if not exists` is then a no-op, so its NOT NULLs, defaults and inline CHECKs never applied. Worst of it: `profiles_grade_check` stayed `grade >= 8`, which **rejects any player below 8th grade and breaks the under-13 flow.** Fixed by the new `025_reconcile_profiles_schema_drift.sql`, which is guarded and a verified no-op on production.
- Wrote `023_family_join_rpc.sql` (P0-2): members-only `families` read, no direct `parent_accounts` insert, `join_family()` / `approve_family_join()` RPCs, joins land *pending* until a member approves, rate limiting, and `generate_family_code()` from `gen_random_bytes` instead of `Math.random()`.
- Applied 025 → 022 → 023 → 024 to **staging only** and attack-tested each as a real `authenticated` user. **18/18 pass.** Two of those passes are fixes for bugs the tests found:
  - **S-15:** `join_family()` logged each attempt then raised for an invalid code — and raising rolls the function's own work back, so the rate limiter counted zero failures and brute force was unlimited. Expected outcomes now return a status; only auth and rate-limit raise.
  - **S-16:** with 022+023 applied, an approved parent could read *nothing*. The family-read policies keyed off the reader's own `profiles.family_code`, and the only way a parent ever got that set was the very self-assignment 022 now blocks — the legitimate path and the attack were the same mechanism. Switched to `is_family_member()`, which requires an approved link.
- **Production untouched.** Confirmed still on its original 23 migrations, read-only access only. Rollout plan with per-step rollback: `docs/HANDOFF.md` §J.
- ⛔ **Known blocker:** 023 breaks `completeFamilySignup()` in `lib/auth.ts` in three places (the `families` lookup, the direct `parent_accounts` upsert, and the `role`/`family_code` upsert). Not fixed here — it changes how family linking works and needs sign-off. `docs/TODO.md` item 1.
- Added `docs/TODO.md`.

## 2026-11-11 — P1-OPS-1: CI
- Added `.github/workflows/ci.yml`: `npm ci` → typecheck → lint → tests → build, on every PR into `main` or `v1` and every push to either. One job (`verify`) so there's a single required status check to configure.
- Node pinned to **24** to match the Vercel project's runtime — CI passing on a different major than production builds on is a gap worth not having.
- Needs no secrets: verified `next build` completes with `.env.local` removed entirely (static generation included).
- The build step retries up to 3×. `next/font` fetches Google Fonts at build time and intermittently fails with `Cannot read properties of null (reading '1')` — reproduced locally several times on otherwise identical runs, with and without env. A required check that fails at random is one people learn to force-merge past, which would defeat the purpose. Typecheck/lint/tests get one attempt each. Logged a P2 to self-host the fonts and delete the retry.
- **Branch protection is a GitHub setting, not a file** — the workflow reports but blocks nothing until `verify` is marked a required check on `main`. Steps in DEPLOYMENT_CHECKLIST.

## 2026-11-11 — P1-PRICE-1: outreach moves to Player; Free tracks 3 schools
- **Coach outreach is now a Player ($19) feature, not Family ($39).** It's the core recruiting loop — gating it at the top tier put the product's whole point behind the most expensive plan, while the tournament fit checker (already free and public) was advertised as a Family feature. Family is now genuinely the parent side: read-only dashboard, season budget, weekly report. **Prices unchanged.**
- **Free accounts track 3 target schools** (previously unlimited, which left Free with no honest ceiling).
- Added `FEATURE_TIER` and `FREE_TIER_TARGET_SCHOOL_LIMIT` to `lib/types.ts` so the UI gate, the API route's error message and the pricing table all quote the number the database enforces.
- `/api/profile` returns a 403 with a real sentence; the star button explains the cap instead of optimistically starring and then silently un-starring when the write is refused.
- Drafted `supabase/migrations/024_tier_gating_outreach_player_free_targets.sql` — **not applied.** It moves the `coach_outreach` write policy to `has_tier('player')` and adds a trigger capping Free `target_school_slugs`. The trigger is the real gate: `profiles` is directly PATCHable through PostgREST, so a limit enforced only in the route is one a user can route around (the P0-1 lesson). A carve-out lets a downgraded account prune below the limit rather than being frozen.
- ⚠️ **Coupling:** the UI half is on `v1` now. Merging `v1` to `main` without applying `024` gives Player users an outreach board that fails every write. Noted in DEPLOYMENT_CHECKLIST and DATABASE_SPEC.
- Tests: 426 → 435.

## 2026-11-10 — P1-FIT-1 + P1-FIT-2: one fit band, and stop capturing a placeholder UTR
- `whatIfProjectionFor()` now always returns a projection. "My pace" passes real history; "+1.5/yr" and "Custom" get a synthetic straight line (`syntheticUtrHistoryFor`) that arrives at the hypothetical UTR on the senior-summer milestone, so `classifySchoolFit` can answer "out-of-range" instead of falling back to "reach" for every below-floor school. Returning `undefined` looked like abstaining but was actually the most flattering possible claim about all 37 programs.
- The untouched what-if panel now passes the **real** projection — the same object `/plan`, school detail, Today, Outreach and Family pass — so cross-screen agreement is structural, not coincidental.
- `useWhatIfUtr` no longer seeds state from props. It stores only the player's explicit choice; with none, the displayed UTR and mode derive from current props and track the real player as soon as it loads. Fixes "You 7.0" on every row for a 5.81 player, and removes the stale-capture class of bug rather than one instance of it.
- No pace button is highlighted until the player picks one. "+1.5/yr" used to render as selected next to a value that was simply their current UTR.
- Extracted the derivation to a pure `resolveWhatIfDisplay()` so it's testable without a DOM (no React testing setup in this repo, and adding one wasn't justified here).
- Added `lib/fit-band-consistency.test.ts` (9 tests). Confirmed it fails (9 failures) when `whatIfProjectionFor` is reverted to the old `undefined` behaviour.
- Tests: 408 → 426.

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
