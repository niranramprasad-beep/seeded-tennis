# Seeded — MASTER ROADMAP

> The command center. Read `/CLAUDE.md` first, then this file. Every task
> below was found by inspecting the code, the live Supabase project
> (`tfpjssmhiptbwigarxpx`), Vercel, and the running app on `localhost:3000`
> on **2026-11-10**. Where something was confirmed live, it says so.
>
> Rule: when you finish, discover, or change anything, update this file in
> the same commit. A task is COMPLETE only when it is implemented, tested,
> integrated, reviewed, documented, and production-safe.

---

## Executive status

Seeded has a polished-looking UI, a real typed data layer, zod-validated
write routes, 382 passing unit tests, and a much more careful RLS setup
than most student projects. That's the good news.

The bad news: **it is not launchable, for three reasons that have nothing
to do with polish.**

1. **The core data is invented.** Every school in `lib/db/schools-data-*.ts`
   has a made-up head coach (Stanford's "Daniel Whitfield"), a made-up
   email (`dwhitfield@stanford.edu`), made-up recent recruits ("Ethan Park,
   Irvine CA"), made-up conference ranks, `example.com` recruiting URLs,
   and roster UTR ranges with no source. The homepage says "Rosters
   verified Oct 2026" and "Every team rating shows its source and date."
   Neither is true. The fit bands, the Plan page, and the coach email are
   all computed from these numbers.
2. **Any signed-in user can give themselves a paid plan or join any
   family.** Confirmed live: `authenticated` has UPDATE on
   `profiles.subscription_tier`, `role`, `family_code`,
   `whop_membership_id`, `stripe_customer_id`, there is no protecting
   trigger, and `families` is readable by every signed-in user. So one
   PATCH request = Family tier for free, and two requests = read
   another kid's UTR history, matches, outreach and email, and edit their
   family's budget.
3. **Production is already broken by the shared database.** `main`
   (what seededtennis.com runs) writes `coach_outreach.status =
   'contacted'`. Migration 011, applied to the one shared Supabase
   project, replaced that value with `'emailed'` and the CHECK constraint
   now rejects `'contacted'`. "Mark contacted" on production fails today.

Everything else (UX bugs, SEO, CI, monitoring) is real but secondary.

## Current production-readiness score

**31 / 100**

| Area | Score | Why |
|---|---|---|
| Security | 3/10 | Two confirmed P0 authorization holes; no rate limits; no headers |
| Data correctness | 1/10 | Catalog and coach data fabricated; fit bands disagree between screens |
| Core UX | 6/10 | Looks good, but several state bugs and theme flips |
| Reliability/Deploy | 3/10 | Prod and dev share one DB; prod code already incompatible with it; no CI |
| Legal/privacy | 2/10 | Minors, COPPA, one-paragraph privacy policy, deletion not implemented |
| Testing | 5/10 | 382 unit tests pass; zero integration/E2E/RLS tests |
| Observability | 1/10 | Vercel Analytics only; no error tracking, no alerts |

---

## Current P0 blockers (deployment blockers)

- [ ] **P0-1 Lock privileged `profiles` columns**

  Status: READY (needs sign-off to apply migration)
  Priority: P0
  Category: Security / Billing
  Why this matters: Any signed-in user can run
  `PATCH /rest/v1/profiles?id=eq.<own id>` with
  `{"subscription_tier":"family"}` using the public publishable key and
  their own JWT. That bypasses every paywall, including the server-side
  `has_tier()` RLS checks (they read this same column). Confirmed live via
  `information_schema.column_privileges` + `pg_trigger` (only
  `profiles_set_updated_at` exists). Same for `role`, `family_code`,
  `whop_membership_id` (lets a user point at someone else's Whop
  membership; `/api/whop/membership` would then fetch that membership's
  `manage_url` with the server Whop key), `stripe_customer_id`,
  `stripe_subscription_id`, `deletion_requested_at`.
  Dependencies: none
  Affected files: new `supabase/migrations/022_lock_privileged_profile_columns.sql`; `lib/auth.ts` (`writeCurrentPlayerProfile` must stop sending these columns); `lib/api-schemas/profile.ts`
  Affected database objects: `public.profiles` (column grants or a BEFORE UPDATE/INSERT trigger)
  Security considerations: Use a `BEFORE INSERT OR UPDATE` trigger that raises if any privileged column changes and `current_setting('request.jwt.claims', true)::json->>'role'` is not `service_role`. Column REVOKEs alone are fragile with PostgREST upserts. On INSERT, force `subscription_tier='free'`, `whop_membership_id=null`, stripe ids null. `role` and `family_code` may only change through the RPCs in P0-2.
  Testing required: SQL test as `authenticated` (set role + jwt claims) proving UPDATE of each column fails; webhook path (service role) still succeeds; normal profile edits still succeed.
  Acceptance criteria: `has_column_privilege` checks or trigger tests show a normal user cannot change any privileged column; `/settings` save still works; Whop webhook still upgrades a test account.
  Deployment impact: DB-only, but shared DB means it hits prod instantly. Prod `main` must not write these columns from the client — verify `git show main:lib/auth.ts` before applying.
  Notes: Also audit every existing row: 2 profiles are `family` tier — confirm both match real Whop memberships.

- [ ] **P0-2 Stop users from joining families they don't belong to**

  Status: READY (needs design sign-off)
  Priority: P0
  Category: Security / Privacy (minors)
  Why this matters: `families` has policy `families readable` = `true` for all authenticated users (confirmed live). Any user can list every family code, set their own `profiles.family_code` + `role='parent'` (P0-1), or insert a `parent_accounts` row for any code (policy only checks `user_id = auth.uid()`). They then pass `is_family_member()` / `is_parent_member()` and can read that child's profile (incl. email, GPA, grade), UTR history, matches, outreach, check-ins, and write the family budget. Family codes are `FIRSTNAME-XXXX` with `Math.random()` — guessable even without the list.
  Dependencies: P0-1
  Affected files: `lib/auth.ts` (`generateFamilyCode`, parent signup, join flow), `components/auth/*parent*`, new migration `023_family_join_rpc.sql`
  Affected database objects: `families`, `family_codes`, `parent_accounts`, `profiles.family_code`, helper functions
  Security considerations: Replace direct writes with a `SECURITY DEFINER` RPC `join_family(code text)` that (a) looks up the code, (b) creates a *pending* parent link, (c) requires the player (or for under-13, the creating parent) to approve. Drop `families readable`; replace with members-only read. Generate codes with `crypto.getRandomValues`, ≥ 10 chars, no name prefix. Rate-limit join attempts.
  Testing required: RLS tests: stranger cannot list families, cannot read a family after guessing a code, cannot write budget; approved parent can.
  Acceptance criteria: Above tests pass; existing 6 families still work.
  Deployment impact: Changes parent signup UX. Needs prod code that uses the RPC before the old policies are dropped.
  Notes: REQUIRES ADULT REVIEW — this is minors' data.

- [ ] **P0-3 Remove fabricated school/coach data from every user-facing surface**

  Status: READY
  Priority: P0
  Category: Data quality / Honesty
  Why this matters: `lib/db/schools-data-{mens,womens,extra}.ts` (≈69 programs) contain invented coach names and emails, invented `recentRecruits`, invented `conferenceRank`, `programNote`, `example.com` recruiting URLs (68 occurrences), and UTR ranges with no source or date. These render on `/schools/[slug]` ("Coaching staff: Daniel Whitfield, dwhitfield@stanford.edu"), in `/outreach` ("To:"), in the pricing claims and in the fit model. The project's own #1 rule is "no generated or made-up data."
  Dependencies: none (short-term fix); P1-DATA-1 for the real fix
  Affected files: `lib/db/schools-data-*.ts`, `lib/types.ts` (`School`), `components/seeded/schools/seeded-school-detail.tsx`, `components/seeded/outreach/seeded-outreach-layout.tsx`, `components/coaches/coaches-view.tsx`, `lib/db/schools.ts`
  Affected database objects: none
  Security considerations: Sending real emails to invented addresses at real universities is a reputational risk for a real minor.
  Testing required: grep test in CI that fails if `coachEmail`, `coachName`, `recentRecruits`, `programNote`, `example.com` appear in the shipped catalog; snapshot of school detail.
  Acceptance criteria: No coach name/email, recruit, conference rank or example URL is shown anywhere. Coaching staff card links to a real athletics staff-directory search instead. Every UTR range shows "Unverified estimate" until P1-DATA-1 lands.
  Deployment impact: Visible copy change.
  Notes: Do not "fix" this by inventing better-looking numbers.

- [ ] **P0-4 Rewrite the coach email draft so it only states things the player told us**

  Status: READY
  Priority: P0
  Category: Product / AI-adjacent content
  Why this matters: `buildCoachEmail()` (`lib/db/schools.ts`) writes "Coach Whitfield", "your 6th-place standing in the ACC", "Your recent classes pull talent from everywhere — Italy to the States", "my roadmap has me closing that gap", and "I'll be at several events this spring and would be glad to play in front of your staff". The first three are fabricated; the last two are claims the player never made. A real 15-year-old would send this to a real coach.
  Dependencies: P0-3
  Affected files: `lib/db/schools.ts`, `lib/db/schools.test.ts`, outreach composer components
  Affected database objects: none
  Security considerations: Recipient must be typed or confirmed by the user; never prefilled from seed data.
  Testing required: unit tests that the body contains no school fact other than name/division/conference, and no sentence about future plans unless the player supplied it.
  Acceptance criteria: Draft uses only player-entered facts + school name; "To" field empty with a link to the school's staff directory; user must confirm before "Open in Gmail".
  Deployment impact: none beyond UI.
  Notes: —

- [ ] **P0-5 Fix production (`main`) breaking against the shared live database**

  Status: READY (needs a decision)
  Priority: P0
  Category: Deployment
  Why this matters: Production runs `main@df8a2df` (Vercel, confirmed). The DB already has migrations 011–021 from the redesign branch. `main`'s `components/coaches/coaches-view.tsx` writes `status: "contacted"`; migration 011's CHECK now only allows `researching|emailed|replied|call_visit|offer|committed`. Every "Mark contacted" in production fails. Other drift likely (budget policies in 019, outreach `has_tier('family')`).
  Dependencies: none
  Affected files: `main` branch
  Affected database objects: `coach_outreach`
  Security considerations: none
  Testing required: smoke-test every write path on prod after the fix.
  Acceptance criteria: Production can create/update outreach rows; a written list of every schema change since `main` and the prod code path it touches.
  Deployment impact: Either hotfix `main` (map `contacted→emailed`) or put production in a maintenance/"beta closed" state until the redesign branch is fixed and merged.
  Notes: Root cause is P0-6.

- [ ] **P0-6 Separate development/staging data from production**

  Status: NOT STARTED
  Priority: P0
  Category: Deployment / Data safety
  Why this matters: Local dev, preview deploys, and production all use Supabase `tfpjssmhiptbwigarxpx`. A migration for an unmerged branch already broke prod (P0-5). Every local sign-in touches real users' data (this audit had to sign into a real account locally because no test project exists).
  Dependencies: none
  Affected files: `.env.example`, Vercel env vars (Preview vs Production), `docs/DEPLOYMENT_CHECKLIST.md`
  Affected database objects: new Supabase project (or Supabase branching)
  Security considerations: Preview deployments must never get the prod service-role key.
  Testing required: confirm preview + local point at staging.
  Acceptance criteria: Production env vars exist only on Production; Preview + Development point at a staging project seeded with fake, clearly-labeled data.
  Deployment impact: High — env var reshuffle. Do it before any further migration.
  Notes: Use Supabase branching if the plan allows it; otherwise a free second project.

- [ ] **P0-7 Remove every false claim from marketing and settings**

  Status: READY
  Priority: P0
  Category: Product honesty / Legal
  Why this matters: The site promises things that don't exist:
  - "Rosters verified Oct 2026" (homepage hero widget) — no verification exists.
  - "Real rosters. Every team rating shows its source and date." — no source/date field exists.
  - "A Sunday email with UTR movement…" (homepage, For parents) — there is no email-sending code anywhere.
  - Settings → Notifications (5 toggles) — saved to `user_settings`, never read by anything.
  - Settings → "Public recruiting page … coaches you email can see your results and video. A parent must approve." — no such page or approval flow exists.
  - "Delete account — Removes everything within 30 days." — only `deletion_requested_at` is set; no job deletes anything.
  - Pricing: "Browse all D1 tennis programs" — catalog is 37 men's + ~32 women's, several D3.
  - "Found a wrong number? Report it and we fix it within 48 hours." — a personal Gmail.
  - Plan header "UTR · verified Nov 7" — self-reported, not verified.
  Dependencies: none
  Affected files: `components/seeded/home/seeded-home-view.tsx`, `components/seeded/settings/{notifications-card,privacy-card,delete-account-dialog}.tsx`, `components/pricing/pricing-view.tsx`, `components/seeded/roadmap/*` header
  Affected database objects: none
  Security considerations: —
  Testing required: copy review checklist in QA_CHECKLIST.md
  Acceptance criteria: Every claim on the site maps to working code or real data.
  Deployment impact: copy only.
  Notes: Hide the notification and public-page toggles until they're real (they're POST-V1).

- [ ] **P0-8 Minors' privacy, consent and deletion**

  Status: BLOCKED (REQUIRES LEGAL/ADULT REVIEW)
  Priority: P0
  Category: Legal / Privacy
  Why this matters: Users are 13–18, and under-13s are allowed via a parent-created account. The privacy policy is one paragraph inside `/terms`. It doesn't list processors (Supabase, Vercel, Whop, Google Analytics, Google Gemini), retention, parental rights, or how deletion works. The under-13 check is client-side only (birth year isn't even stored). Account deletion doesn't delete. GPA, grade, email and UTR history of minors are stored.
  Dependencies: P0-1, P0-2
  Affected files: `app/terms/page.tsx`, new `app/privacy/page.tsx`, deletion job (Supabase scheduled function or Vercel cron), onboarding
  Affected database objects: `profiles.deletion_requested_at`, all user tables (cascade audit)
  Security considerations: Hard delete must cover `auth.users` + every table; check `NO ACTION` FKs (`season_budgets.updated_by`, `budget_expenses.created_by`).
  Testing required: deletion E2E on staging.
  Acceptance criteria: Reviewed privacy policy + terms; COPPA approach decided by an adult/lawyer; deletion job runs and is logged.
  Deployment impact: medium.
  Notes: Claude can draft; a parent/lawyer must approve. Do not present drafts as legal advice.

---

## Current P1 blockers (important before launch)

- [ ] **P1-SEC-1 Lock down `/api/training/copilot` (Gemini)** — any signed-in free user can call it unlimited times with unbounded `message`/`history`/`sessions` bodies (cost abuse); raw provider errors are returned to the client; its prompt tells the model to "make a reasonable default choice" and create sessions, which violates the "no auto-generated training" rule. Action: delete the route for V1 (it's only used by the Legacy training view). Category: Security/AI. Acceptance: route returns 404 or is removed; `GEMINI_API_KEY` removed from prod.
- [ ] **P1-SEC-2 Restrict public-profile reads** — `profiles_discovery_read` lets any authenticated user read the *whole row* (email, GPA, grade, family_code, stripe ids) of any profile with `privacy_level='public'` (1 such row live). Friends feature is gone, so drop the public/friends branches or expose a narrow view. Acceptance: SQL test as stranger returns no columns beyond name/grad year (or nothing).
- [ ] **P1-SEC-3 Rate limiting + abuse controls** — none exist on any API route, signup, family join, or check-in. Add Vercel Firewall rate-limit rules (cheapest) for `/api/*` and auth. Enable Supabase leaked-password protection (advisor WARN, confirmed).
- [ ] **P1-SEC-4 Security headers** — `next.config.mjs` sets none. Add CSP (start report-only), `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.
- [ ] **P1-SEC-5 Remove dead billing surface** — `/api/stripe/{checkout,portal,webhook}` are live endpoints for a path that isn't used. Delete them and `lib/stripe.ts`; keep the columns until a cleanup migration.
- [ ] **P1-SEC-6 Revoke EXECUTE on helper functions from `authenticated` where RLS doesn't need direct RPC access** — advisor flags `are_friends`, `current_family_code`, `has_tier`, `is_family_member`, `is_parent_member` as callable via `/rest/v1/rpc/*`. Low impact (they only answer about the caller) but `is_family_member(code)` is an oracle for valid family codes until P0-2 lands. Drop `are_friends` entirely.
- [ ] **P1-FIT-1 Fit bands disagree between screens** — `whatIfProjectionFor()` returns `undefined` for any mode except "My pace", and `classifySchoolFit` with no projection returns "reach" for *every* below-floor school. Live result: Stanford is "Out of range" on its own page and on Plan, but "Reach" on `/schools` ("Reach 37 · Out of range 0"). Fix: build a synthetic projection for +1.5/yr and Custom modes; never fall back to unbounded "reach". Tests: same player + school → same band on Plan, Schools, School detail, Today, Outreach, Family.
- [ ] **P1-FIT-2 Schools page shows the wrong UTR** — `useWhatIfUtr` seeds `useState(currentUTR)` once, before the player loads, so it captures the default `currentUTR: 7` (`lib/auth.ts:275`, `lib/data/user.ts:10`). Live: a 5.81 player sees "You 7.0" on every row. Also "+1.5/yr" is highlighted while the value equals current UTR (Plan page). Fix: reset state when `currentUTR`/`myPaceValue` change, or don't render until the player is loaded.
- [ ] **P1-FIT-3 Projection outputs are nonsense on noisy data** — Stanford page: "Pace: Projected 4.3 by Jun 1, 2028" for a 5.81 player; Plan chart band runs from ~6.2 down to ~2.0. One logged entry of ~7.0 between ~4.3 and ~5.6 dominates the regression. Fix: outlier rejection, floor projection at current UTR minus a small decay, show "not enough consistent data" instead of a falling forecast.
- [ ] **P1-FIT-4 Pre-auth "Reach" is unbounded** — the homepage calculator and onboarding call `classifySchoolFit` without a projection, so a 3.0 UTR player sees Stanford as "Reach". Use a fixed realistic-pace cap (0.5–1.5/yr from `REALISTIC_UTR_IMPROVEMENT_PER_YEAR`) to mark Out of range.
- [ ] **P1-DATA-1 Real roster import (migration 012)** — see DATA_QUALITY.md. This is the real fix for P0-3 and the single most valuable product task. Includes coverage below D1-elite: a 5.81 UTR player currently has **zero** schools in range (closest: Middlebury, 4.7 below avg). Without D2/D3/NAIA/JUCO coverage the product has no answer for most juniors.
- [ ] **P1-UX-1 Theme flips between pages** — Today and Plan render light, Schools/Outreach/Events/Settings render dark in the same session; Settings shows "Match system" selected while localStorage has `seeded.mode=light`; the sidebar toggle label switches between "Light mode" and "Dark mode". Fix the hydration order in `lib/context/design-context.tsx`.
- [ ] **P1-UX-2 Remove Legacy from the product** — users can reach "Legacy theme" (Settings → Appearance) and "Switch to Legacy" (app footer). Legacy doubles every bug surface (two contact pages, two coach views, legacy `/dashboard`, `/training`, `/coaches`, the copilot). Freeze then delete for V1; keep redirects.
- [ ] **P1-UX-3 Mobile `/schools` table is clipped** — at 390px the "Your fit" column and badge are cut off with no scroll affordance. Make rows stack on mobile.
- [ ] **P1-UX-4 Mobile `/plan` pace warning collapses** — the warning text wraps to one word per line beside "Show realistic targets". Stack the button under the text below `sm`.
- [ ] **P1-OPS-1 CI** — no `.github/workflows`. Add one workflow: `npm ci`, `tsc --noEmit`, `next lint`, `vitest run`, `next build` on every PR; require it on `main`.
- [ ] **P1-OPS-2 Error tracking + uptime** — add Sentry (or Vercel's log drains + alerts) and an uptime check on `/` and `/api/health`.
- [ ] **P1-OPS-3 Migration history drift** — live history uses timestamps (`20261110205721_outreach_stages`, …) while the repo uses `011_…`; two live migrations (`rls_auto_enable_revoke_direct_grants`, `set_updated_at_revoke_authenticated_direct_grant`) exist only as comments inside `020`. Add them as real files and document the mapping in DATABASE_SPEC.md.
- [ ] **P1-PRICE-1 Paywall placement** — writing `coach_outreach` requires `has_tier('family')` ($39). The core recruiting action is gated behind the family plan, while "Unlimited tournament fit checks" (already public) is listed as a Family feature. Decide V1 tiers before launch; update `pricing-view.tsx`, `paid-gate.tsx`, Whop webhook `TIER_PRICE_USD`, and the RLS policies together.
- [ ] **P1-AUTH-1 Google sign-in callback** (from HANDOFF H.3) — or remove the Google button for V1.
- [ ] **P1-TRAIN-1 Remove the auto-generating training wizard** (HANDOFF H.2). Training is POST-V1 anyway.

## Current P2 tasks

- [ ] Homepage header nav wraps to two rows at ~1280–1520px widths ("Fit report · Tournament checker · Schools" / "For parents · Pricing") — give the nav `flex-nowrap` and collapse to a menu below `lg`.
- [ ] Homepage: the "UTR TELLS YOU WHERE YOU STAND…" eyebrow sits 6px from the trust band's bottom border (no top padding) — add section padding.
- [ ] Homepage: FAQ column (≈510–1003px) doesn't align with the 415–1098px content column; FAQ `<summary>` rows are ~16px tall (touch target < 24px).
- [ ] Homepage: "Who built this" card has ~70px dead space and "Seeded's founder" with no name; the parent stat card ("+0.12, 2, $1,840") isn't labeled as an example the way the Today mock is.
- [ ] Homepage: two `<h1>` elements in the DOM (desktop + hidden mobile); use one.
- [ ] Login page uses Legacy styling (slate-blue inputs, pill button, orange eyebrow) inside the Seeded shell; inputs rely on placeholders, no visible labels.
- [ ] Chart SVG text renders in a serif fallback (Today "UTR vs plan": "Mar '26", "Jun '27 · 7.10"); the right-edge label is clipped. Set `font-family` on the SVG.
- [ ] Today: first paint shows "Log a few more UTR results to unlock a projected range" and a single dot, then swaps to the real chart — wrong empty state flashes. Show a skeleton until data loads.
- [ ] Date formats disagree: "Next checkpoint: 7.10 by Jun 1" (Today pill) vs "by Jun '27" (card) vs "Jun 2027" (Plan).
- [ ] "Live data, your own account." footer text on Today/Plan reads like debug output.
- [ ] Events: week calendar squeezed into a ~225px column shows Mon–Thu only with a horizontal scrollbar; first hour label is clipped. Give it full width or default to an agenda list.
- [ ] Settings vs Billing: the "Settings" title and left nav sit 3px further right on `/settings/billing` than on `/settings` (503px vs 506px; nav 514 vs 517).
- [ ] Pricing: the Family card is offset ~7px lower than Free/Player (badge pushes content); gradient headline text is off-palette.
- [ ] Schools row: chevron + checkbox + star = three tiny unlabeled controls; the compare checkbox is a near-invisible dark square.
- [ ] Settings placeholders "Bethesda, MD" and "3.7" look like real values.
- [ ] `/schools/cornell` 404s (real slugs are `cornell-m`/`cornell-w`); redirect bare slugs to the user's gender.
- [ ] School detail: layout shifts ~15px horizontally after load; footer starts 10px right of the sidebar edge.
- [ ] SEO: every school page has the same `<title>`; add `generateMetadata`. Sitemap lists legacy/redirecting `/cost-calculator`, `/how-it-works`, `/parents` and omits `/methodology`. See SEO_CHECKLIST.md.
- [ ] `.env.example` mentions OpenAI and `/api/match-analysis` (doesn't exist) and omits `GEMINI_API_KEY`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA4_MEASUREMENT_PROTOCOL_API_SECRET` — fixed in this audit.
- [ ] `tsc --noEmit` fails on stale `.next/types/app/friends/page.ts`; exclude `.next/types` of deleted routes or `rm -rf .next` in CI.
- [ ] Whop checkout `redirect_url` points to legacy `/dashboard?checkout=success`.
- [ ] Recruiting checklist repeats the same NCAA disclaimer 6 times; auto-tracked items look like disabled checkboxes.
- [ ] UTR entry validation: no outlier warning when a new entry differs from the last by > 1.0.

## Current P3 tasks

- [ ] Drop `friendships`, `badges` tables and `are_friends()` (dead features).
- [ ] Delete `REVAMP_REPORT.md`, `UI_AUDIT.md`, `SUPABASE_SETUP.md`, `AGENTS.md` once their content is in docs/.
- [ ] Move dev preview harnesses behind a single `app/dev/layout.tsx` guard.
- [ ] Reconsider Framer Motion + Recharts bundle cost on mobile.

---

## V1 scope

### MUST SHIP FOR V1
- Email/password signup, login, logout, password reset
- Onboarding incl. under-13 → parent-created account (server-enforced)
- Real school catalog with source + date on every number (P1-DATA-1)
- Fit bands (Likely/Target/Reach/Out of range) that agree everywhere
- Plan: manual UTR log, trajectory, checkpoints
- Schools browse + school detail + save to targets
- Outreach tracker (stages, notes, reminders) with user-supplied coach contact and an honest draft
- Family: parent read-only view + season budget, with a safe join flow
- Billing through Whop with tiers that can't be self-assigned
- Working account deletion; reviewed privacy policy + terms

### SHOULD SHIP FOR V1
- Tournament fit checker (public, already works)
- Events: tournaments + results (calendar optional)
- Sunday check-in
- Dark mode (only once theme flipping is fixed)
- CSV data export
- Google sign-in (only if P1-AUTH-1 is done properly)

### POST-V1 (do not block launch)
- AI training copilot, training calendar/templates
- Weekly parent email, any notifications
- Public recruiting page, alerts
- Yearly pricing / pricing redesign
- Transfer portal, similar players, recruiting probability, commitment tracking, roster openings
- Legacy design system (delete, don't ship)
- Stripe

## Deferred features
Everything in POST-V1 above. "Leaving" counts and "Data/verification" columns stay hidden until P1-DATA-1 provides real class years and verification dates.

---

## Architecture tasks
- [ ] P0-6 staging project. [ ] P1-UX-2 delete Legacy. [ ] P1-SEC-5 delete Stripe. [ ] Move the school catalog from TS files to Postgres (P1-DATA-1). [ ] Add `/api/health`.

## Database tasks
- [ ] P0-1, P0-2, P1-SEC-2, P1-SEC-6, P1-OPS-3. [ ] Migration 012 teams/players/roster_sources. [ ] Drop dead tables (P3). [ ] RLS test suite (see QA_CHECKLIST.md).

## Data-quality tasks
- [ ] P0-3. [ ] P1-DATA-1. [ ] Reliability classification on every rating (DATA_QUALITY.md). [ ] Outlier detection on user UTR entries.

## Security tasks
- [ ] P0-1, P0-2, P1-SEC-1…6. See SECURITY_CHECKLIST.md.

## Product tasks
- [ ] P0-4, P0-7, P1-PRICE-1, P1-FIT-1…4, P1-TRAIN-1.

## UX tasks
- [ ] P1-UX-1…4 and all P2 visual items above.

## Performance tasks
- [ ] Measure first: run Lighthouse on `/`, `/schools`, `/schools/[slug]` on a production build. The catalog ships as a TS module to the client; after P1-DATA-1, page it from the DB. No other bottleneck was observed at current scale (8 profiles).

## Accessibility tasks
- [ ] Visible labels on login inputs. [ ] FAQ and row-control touch targets ≥ 24px. [ ] Compare checkbox contrast. [ ] Chart text alternatives (summary sentence already present — keep it). [ ] Keyboard pass on what-if slider and calendar drag. [ ] `prefers-reduced-motion` for Reveal animations.

## SEO tasks
- See SEO_CHECKLIST.md.

## AI tasks
- [ ] P1-SEC-1 (remove copilot for V1). [ ] Any future AI feature must separate DATABASE FACTS from AI INTERPRETATION and pass the rules in CLAUDE.md.

## Email tasks
- [ ] P0-4. [ ] Hide weekly-digest promises (P0-7). Post-V1: pick a provider (Resend), double opt-in for parents, unsubscribe, bounce handling.

## Testing tasks
- [ ] RLS tests, API route tests, Playwright E2E for the 20 journeys in QA_CHECKLIST.md, CI (P1-OPS-1).

## Deployment tasks
- [ ] P0-5, P0-6, P1-OPS-1. See DEPLOYMENT_CHECKLIST.md.

## Legal/privacy tasks
- [ ] P0-8 (REQUIRES LEGAL/ADULT REVIEW). [ ] UTR data: the product stores self-reported numbers only — keep it that way; never scrape. [ ] Roster data licensing review before import (DATA_QUALITY.md §Licensing).

## Monitoring tasks
- [ ] P1-OPS-2. Alerts: 5xx rate on `/api/*`, Whop webhook failures, deletion job failures, data freshness > 120 days on any roster.

---

## Launch checklist
- [ ] Zero open P0. [ ] Zero open P1-SEC. [ ] Staging exists and every migration ran there first. [ ] CI green on `main`. [ ] 20 QA journeys pass on staging and production. [ ] Fit bands identical across screens for 3 test players. [ ] No unsourced number visible anywhere. [ ] Privacy policy + terms approved by an adult. [ ] Rollback rehearsed (Vercel "Promote previous deployment"). [ ] Error tracking + uptime alerts firing to a real inbox.

## Post-launch checklist
- [ ] Weekly: review error tracker, Whop webhook log, roster freshness. [ ] Monthly: Supabase advisors (security + performance). [ ] Each research session: re-run roster import on staging, then prod.

## Future roadmap
Post-V1 list above, in this order: weekly parent email → notifications → public recruiting page → transfer portal tracking → similar players.

---

# NEXT 10 TASKS

1. P0-5 — decide hotfix-vs-maintenance for production and stop the `contacted` write failures.
2. P0-6 — create a staging Supabase project and point Preview/Development at it.
3. P0-1 — migration 022: lock privileged `profiles` columns (write SQL, get sign-off, apply on staging, then prod).
4. P0-2 — migration 023: `join_family()` RPC, drop `families readable`, crypto-random codes.
5. P0-3 — strip coach names/emails/recruits/ranks/example URLs from the UI and catalog.
6. P0-4 — rewrite `buildCoachEmail()` to player-supplied facts only.
7. P0-7 — remove false claims (verified rosters, Sunday email, notifications, public page, 30-day delete, "all D1").
8. P1-SEC-1 + P1-SEC-5 — delete `/api/training/copilot` and the Stripe routes.
9. P1-FIT-1 + P1-FIT-2 — one consistent fit band everywhere; fix the stale "You 7.0" what-if state.
10. P1-DATA-1 — migration 012 + re-runnable roster import with source/date/reliability, starting with D3/D2 coverage.
