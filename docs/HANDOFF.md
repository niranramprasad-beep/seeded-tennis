# Seeded — Handoff

> **Correction banner (2026-11-10 audit).** `docs/MASTER_ROADMAP.md` is now
> the source of truth for status. Specific claims below are no longer
> accurate: §G "Known bugs: none" (see P0/P1 list); §E's RLS table omits
> that users can write their own `subscription_tier`/`role`/`family_code`
> and that `families` is readable by everyone (SECURITY_CHECKLIST S-1/S-2);
> §G "built and verified" doesn't cover the fit-band inconsistency between
> `/schools` and `/plan` (P1-FIT-1) or the stale "You 7.0" what-if state
> (P1-FIT-2). Production `main` is broken against the live DB (P0-5).

Written at the end of a long redesign effort on branch
`codex/identity-overhaul-orange-green-pink` (HEAD `3fc90b6` as of writing).
Every fact below was verified directly against the code, git log, live
Supabase schema, and the actual running app — not recalled from memory.
If something here ever looks wrong, trust the code over this file and fix
this file.

---

## A. Product

**Seeded** helps junior tennis players (and their families) figure out a
realistic path to college tennis recruiting: which teams they can
realistically make, what to do this week to get closer, and whether a given
tournament or coach email is worth the time and money.

**Who it's for:**
- **Player** — the primary account. Logs UTR, targets schools, reaches out
  to coaches, plans training/events.
- **Parent** — a secondary account, linked to a player via a family invite
  code. Read-only on the player's own data (UTR, outreach, schools), but
  owns the season budget (the one thing a parent can write that a player
  can't).

**Core loop:** log a real UTR / match result → see real Reach/Target/
Likely/Out-of-range bands against real school roster data → get a short,
honest list of what to do this week → draft a real coach email (Gmail
compose link, never auto-sent) → track replies and follow-ups → parent gets
a read-only weekly view plus season budget control.

**Pricing — what's live in code right now:** Free $0 forever, Player
$19/mo, Family $39/mo. Flat, monthly-only. Hardcoded in three places that
must be changed together if they ever change: `components/pricing/
pricing-view.tsx`, `app/api/whop/webhook/route.ts`'s `TIER_PRICE_USD`, and
`components/shared/paid-gate.tsx`'s `TIER_PRICE`.

**Pricing — what the mockups want, NOT live yet:** Free $0; Player $12/mo
or $99/yr; Family $19/mo or $159/yr; with a yearly/monthly toggle. This was
**deliberately held back** through this entire project (explicit, repeated
instruction) because it needs real Whop plan/price changes first — showing
these numbers on the page while checkout still charges the old amounts
would be a real bait-and-switch. See TODO §H.5.

---

## B. Stack + Setup

**Versions (from `package.json`):** Next 14.2.35 · React 18.3.1 ·
TypeScript 5.5.3 · Tailwind 3.4.6 · `@supabase/supabase-js` 2.106.1 · Zod
4.6.5 · Vitest 1.6.1 · Framer Motion 11.3.19 · `geist` 1.9.0 · `recharts`
2.12.7 · `swr` 2.5.1. `stripe` and `@google/genai` are also dependencies
(see below — both pre-date this redesign and are only partially wired in).

**Supabase project:** ref `tfpjssmhiptbwigarxpx`, org `pgjmjdoncihbnkekvnvr`,
region `us-west-1`. **This is the SAME project for local dev and
production** — see Gotchas §I, this is the single biggest standing risk in
this codebase.

**Vercel:** project `seeded-tennis` under `niranramprasad-3534s-projects`.
Auto-deploys `main` straight to `seededtennis.com`. No staging gate — a
push to `main` is a push to production.

**Whop:** the real, live billing provider. `app/api/whop/webhook/route.ts`
receives membership events and writes `subscription_tier` on `profiles`.
`/settings/billing` reads real plan/price/renewal data and deep-links every
mutating action (change plan, update card, cancel) to Whop's own hosted
portal — this app never builds custom payment UI.

**Stripe:** present in the codebase (`lib/stripe.ts`-style code, `app/api/
stripe/{checkout,portal,webhook}/route.ts`, migration `007_stripe_billing
.sql`) but **not wired into the UI** — a shelved earlier billing attempt,
kept because removing it isn't worth the risk. Whop is the real path.

**GA4:** `NEXT_PUBLIC_GA_MEASUREMENT_ID` (client-side) +
`GA4_MEASUREMENT_PROTOCOL_API_SECRET` (server-side, lets the Whop webhook
report real purchase/revenue events via the Measurement Protocol). Both
configured locally and in Vercel.

**Env var NAMES currently set locally** (verified directly against
`.env.local`, names only — never values, never paste these anywhere with a
real value next to them):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_GA_MEASUREMENT_ID
GA4_MEASUREMENT_PROTOCOL_API_SECRET
WHOP_API_KEY
WHOP_WEBHOOK_SECRET
```
The AI and Stripe variables that used to appear in this list were deleted
with their routes (P1-SEC-1 / P1-SEC-5, 2026-11-10). `.env.example` is now
the authoritative list: if a name isn't in it, no code path reads it.

**Commands:**
```
npm run dev                  # local dev server, localhost:3000
npx vitest run                # full test suite (382 passing as of writing)
npx tsc --noEmit               # typecheck
npx next build                 # production build (clear .next first if you
                                # hit a stale-cache "Cannot find module
                                # './NNNN.js'" error — known flaky, not a bug)
npx next lint                  # lint
```
**Supabase migrations and type generation** are NOT done via a local
Supabase CLI in this project's workflow — every migration this session was
applied via the Supabase MCP's `apply_migration` tool directly against the
live project, and types were generated via that same MCP's
`generate_typescript_types` tool, writing straight into `lib/db/
database.types.ts`. If a future session doesn't have that MCP, the
fallback is reading migration files in order and hand-writing types to
match — do not guess at the schema, read the migrations.

---

## C. Architecture

**Two parallel design systems, same codebase.** `data-design` is either
`"legacy"` (the original 9-palette app, frozen, preserved) or `"seeded"`
(the pixel-exact rebuild this whole project was about — now the default for
new visitors). Toggled via `lib/context/design-context.tsx`, persisted in
`localStorage` (`seeded.design`). **Legacy must never be touched** going
forward unless explicitly asked — every Seeded-side component lives under
`components/seeded/*`, mirroring the Legacy equivalent in `components/*`.

**Folder map (the parts that matter):**
```
app/                          # routes — see §D for the full table
  api/                        # route handlers; writes go through these,
                               # not directly from components (see below)
  dev/*-preview/               # throwaway harnesses, 404 in production,
                               # used to test authenticated features without
                               # ever signing in through real local auth
components/
  ui/                          # SHARED primitives (Button, Card, Badge,
                               # Drawer, Skeleton...) — Legacy depends on
                               # these, be careful changing them
  seeded/
    ui/                        # Seeded-only primitives (FitBadge, RangeBar,
                               # ActionCard, Toast, StarButton, WhatIfPanel…)
    {dashboard,roadmap,schools,outreach,events,family,settings,
     onboarding,methodology,sample-report,tournament-fit}/
                               # one folder per Seeded screen
  {dashboard,roadmap,schools,coaches,matches,training,...}/
                               # Legacy equivalents — untouched
lib/
  db/                          # typed data-access layer — see below
  api-schemas/                 # zod schemas for every write route
  api-auth.ts                  # getRequestScopedSupabase() — the
                               # RLS-respecting client used inside API
                               # routes (NOT the service-role client)
  school-fit.ts                # the 4-band fit classifier — see below
  context/                     # design-context, tier-context,
                               # player-context, sidebar-context
  auth.ts                      # signUp/signIn/signInWithGoogle/
                               # saveCurrentPlayer and friends
supabase/migrations/           # every schema change, see §E
```

**`lib/db/` — the typed data-access layer.** One module per area
(`schools.ts`, `plan.ts`, `targets.ts`, `outreach.ts`, `events.ts`,
`family.ts`, `settings.ts`), plus `database.types.ts` (real,
machine-generated Supabase types — regenerate via the Supabase MCP's
`generate_typescript_types` if the schema changes, never hand-edit it) and
`narrow.ts` (small helpers that narrow a generated `string` column, e.g.
`matches.surface`, down to the app's real literal union type, e.g.
`"hard"|"clay"|"grass"|"indoor"`, with an explicit documented fallback —
because Postgres CHECK constraints don't surface as TS literal types in
generated schemas). **Components and pages never call Supabase directly**
— they call a `lib/db/*` function, which either reads via a client-side
Supabase call (for simple, low-risk reads) or posts to an `app/api/*` route
for writes.

**The write pattern:** every real write (UTR entries, matches, training
sessions/templates, profile fields, outreach status/reminders/reply-notes,
budget, tournament entries, account deletion) goes through an `app/api/*`
route handler, which: (1) validates the request body with a zod schema
from `lib/api-schemas/`, (2) gets a request-scoped, RLS-respecting Supabase
client via `lib/api-auth.ts`'s `getRequestScopedSupabase()` (never the
service-role client for a user-initiated write), (3) performs the write,
(4) returns a clear error on failure. The browser-facing `lib/db/*`
function just does `fetch()` to that route and throws on a non-2xx
response — same contract every call site already expected, so this was a
transparent swap under existing UI error handling.

**Auth + roles.** `components/shared/auth-gate.tsx` wraps every
authenticated page. Current logic:
```ts
isParentAllowedPath(pathname) =
  pathname.startsWith("/family") || pathname.startsWith("/settings") ||
  pathname === "/cost-calculator" || pathname === "/tournament-fit"

isPlayerBlockedPath(pathname) = pathname.startsWith("/family")
```
No session → `/login`. Parent on a non-allowed path → `/family`. Player on
`/family` → `/today` (Seeded) or `/dashboard` (Legacy). Player not yet
onboarded and not on `/onboarding` → `/onboarding`. Role lives on
`profiles.role` (`"player"|"parent"`), read through `usePlayer()`
(`lib/context/player-context.tsx`).

**Theme (Light / Dark / System).** `lib/context/design-context.tsx` is the
single source of truth: `design` (`"legacy"|"seeded"`) and `seededMode`
(`"dark"|"light"`), with a `systemSync` boolean that follows the OS
`prefers-color-scheme` until the user explicitly picks Light or Dark.
Stored in `localStorage` (`seeded.design`, `seeded.mode`,
`seeded.mode.system`). The actual colors live in `app/globals.css` under
`[data-design="seeded"][data-seeded-mode="dark"|"light"]` — a real,
distinct dark palette now exists (it used to be a no-op, both blocks were
byte-identical; fixed this session). Legacy's own themes (`data-theme`,
9 palettes including its own separate dark "Night Rally" concept) are a
completely different, untouched system.

**Tier gating.** `lib/context/tier-context.tsx`'s `TierContext` reads
`profiles.subscription_tier` (`"free"|"player"|"family"`, rank order
`free=0 < player=1 < family=2`). `components/shared/paid-gate.tsx` wraps a
feature and shows an upsell when the tier is too low. The same check exists
at the database layer too: `has_tier(required_tier)` is a `SECURITY
DEFINER` SQL function called from RLS `WITH CHECK` clauses on several
tables' write policies (training, coach_outreach) — so a paywall isn't just
a UI nicety, it's enforced server-side even if someone calls the Supabase
REST API directly.

**Design tokens.** `components/ui/` is the SHARED primitive set
(`button`, `card`, `badge`, `drawer`, `progress`, `skeleton`, `slider`) —
Legacy depends on these, don't change their visual behavior without
checking Legacy first. `components/seeded/ui/` is the Seeded-only set
(`action-card`, `button`, `data-chip`, `empty-state`, `fit-badge`,
`range-bar`, `star-button`, `toast`, `toggle`, `what-if-panel`) — pixel-
matched to `DesignSystem.dc.html`. Colors are CSS custom properties
(`--c-bg`, `--c-ink`, `--c-primary*`, `--c-line`, etc.) read through
Tailwind's `rgb(var(--c-x) / <alpha-value>)` pattern — never hardcode a hex
color in a Seeded component, always use the token.

---

## D. Routes

| Route | Renders | Mockup | Who can access |
|---|---|---|---|
| `/` | Homepage (desktop + mobile via CSS breakpoints) | `Main.dc.html` / `MobileHome.dc.html` | public |
| `/pricing` | Pricing page | `Pricing.dc.html` — **not yet matched**, still old flat $19/$39 | public |
| `/onboarding` | Pre-auth fit report → real signup (Seeded) / legacy post-auth step flow (Legacy) | `Onboarding.dc.html` | public (becomes the real account-creation door for Seeded) |
| `/today` | Player dashboard, real rules-based action list | `Today.dc.html` | player, authed |
| `/plan` | UTR trajectory, goal pace, target list, recruiting checklist | `PlayerProfile.dc.html` | player, authed |
| `/schools` | Full catalog, what-if slider, compare tray | `Schools.dc.html` | public (browsable signed out) |
| `/schools/[slug]` | Single school, "Why this band", roster range | `SchoolProfile.dc.html` | public |
| `/outreach` | 6-stage coach pipeline + draft composer | `Outreach.dc.html` | player, authed |
| `/events` | Tournaments (fit-checked) + results + real week calendar | `Events (schedule + results).dc.html` | player, authed, **Player-tier or above** (paywalled) |
| `/tournament-fit` | Live tournament-worth-it calculator | `Tournament fit finder.dc.html` | public |
| `/methodology` | Real fit-methodology explainer | `Methodology.dc.html` | public |
| `/sample-report` | Marketing demo of the weekly parent report — **intentionally fake example data, clearly labeled** | `Sample parent report.dc.html` | public, not linked from inside the authed app |
| `/settings` (+ tabs) | Profile, notifications, appearance, privacy/data, delete account | `Settings + account.dc.html` | authed, both roles |
| `/settings/billing` | Real plan/price/renewal, deep-links to Whop portal | `Billing.dc.html` | authed, both roles |
| `/family`, `/family/budget`, `/family/weekly-reports` | Parent overview, budget (parent-write/player-read), weekly report | `Parent view + budget.dc.html` | parent only (player blocked entirely) |
| `/dev/*-preview` (13 routes) | Throwaway harnesses, mock data, no real auth | n/a | 404 in production |
| `/dev/design` | Design-system token/component catalog | `DesignSystem.dc.html` | 404 in production |
| `/dashboard`, `/roadmap`, `/coaches`, `/match-mode`, `/training`, `/cost-calculator` | Legacy's original pages — byte-for-byte unchanged | none (Legacy, pre-redesign) | Legacy users only — see redirects below |
| `/login`, `/signup`, `/parent-login`, `/parent-signup`, `/reset-password` | Pre-existing auth pages | none | public |
| `/how-it-works`, `/parents`, `/contact`, `/terms`, `/matches` | Pre-existing marketing/legacy pages, out of scope this project | none | public / authed as applicable |

**Redirects** (via `components/shared/seeded-route-redirect.tsx`, mounted
inside each old page — client-side only, since there's no server-visible
signal for which design a visitor has chosen, only `localStorage`):
- `/dashboard` → `/today`
- `/roadmap` → `/plan`
- `/coaches` → `/outreach`
- `/match-mode` → `/events`
- `/training` → `/events`
- `/cost-calculator` → `/family` (the cost calculator itself now lives as a
  tab inside `/family/budget`)

**Crucial property of these redirects:** they ONLY fire when
`design === "seeded"`. A Legacy user clicking their own sidebar's
"Training" link never redirects — they see the exact same Legacy Training
page they always did. This was verified empirically, not just by reading
the code.

---

## E. Database

**Helper functions** (all `SECURITY DEFINER`, all have `anon` EXECUTE
revoked — only `authenticated` can call them, which RLS policies need):
- `set_updated_at()` — generic `BEFORE UPDATE` trigger, bumps `updated_at`.
- `current_family_code()` — the calling user's own `family_code`.
- `is_family_member(code)` — is the caller in this family (either role)?
- `is_parent_member(code)` — is the caller in this family AND role=parent?
  (new this session, backs the parent-only budget-write policies)
- `are_friends(a, b)` — mutual-friendship check (Friends feature itself
  was removed product-wide; this function is now effectively dead code
  still present in the schema, locked down, not currently called by any
  live feature).
- `has_tier(required_tier)` — tier-gate check for RLS write policies.

**Every table, in plain English:**
| Table | What it is | RLS in plain English |
|---|---|---|
| `profiles` | One row per account | Own row: full read/write. Family members: read. Public/friends (if `privacy_level='public'`): read. |
| `utr_entries` | Logged UTR history | Own: full. Family: read-only (added this session — parents couldn't see this before). |
| `matches` | Logged match results | Own: full. Family: read-only. |
| `coach_outreach` | 6-stage outreach pipeline per school | Own: full (write requires `has_tier('family')`). Family: read-only. |
| `tournament_entries` | Real tracked tournaments (Events page) | Own: full. Family: read-only. |
| `training_plans` / `workout_sessions` / `exercises` / `session_exercises` / `saved_templates` | Training calendar data | Own: full (writes require `has_tier('player')`). |
| `daily_checkins` | Streak check-in feature | Own: full. Family: read-only. |
| `cost_calculations` | Lifetime cost projection tool (separate from season budget) | Own: full. Family: read-only. |
| `season_budgets` / `budget_expenses` | Real season budget + expense log | **Family: read. Parent only: write** (fixed this session — players could previously write their own family's budget, contradicting the product's own stated rule). |
| `recruiting_checklist_items` | Plan page's real checklist state | Own only, full. |
| `encouragement_notes` | Parent → player notes | Family: read. Parent: insert. |
| `parent_reports` | Weekly parent report snapshots | Family: read. |
| `family_codes` / `parent_accounts` / `families` | Family linkage plumbing | Scoped to the family/own row. |
| `badges` / `friendships` | Leftover schema from removed features (badges UI, Friends feature — both deleted product-wide) | RLS still correct and locked down; no live feature writes to either. |

**Every migration (all applied — confirmed directly against the live
project, not just read from file comments, which are stale disclaimers
written before being run):**
| # | One line |
|---|---|
| `0001_init` | Original schema: families, profiles, coach_outreach, base RLS. |
| `001_initial_saas_schema` | Production SaaS schema + `set_updated_at` utility. |
| `002_utr_entries` | UTR history table. |
| `003_families_signup_fix` | Signup-flow family-code fix. |
| `004_fix_profiles_recursion` | Fixed infinite RLS recursion on `profiles` via a `SECURITY DEFINER` helper. |
| `005_feature_expansion` | `family_codes`, `parent_accounts`, `daily_checkins`, `matches`, `badges`, `friendships`, `cost_calculations`, `parent_reports`, `encouragement_notes`. |
| `006_full_utr_range` | Widened UTR check constraint to the real full range. |
| `007_stripe_billing` | Stripe columns (shelved path, see §B). |
| `008_whop_billing` | Whop membership column (the real, live path). |
| `009_coach_outreach` | Original 2-stage (`contacted`/`replied`) outreach table. |
| `010_enforce_tier_gating` | `has_tier()` + server-side tier-gated write policies. |
| `011_outreach_stages` | Widened outreach to 6 stages; added `updated_at` trigger it was missing; added `remind_at`. |
| `012` | **Intentionally does not exist** — reserved for the deferred roster-import project, see TODO §H.6. Never reuse this number. |
| `013_tournament_entries` | Real storage for tracked tournaments. |
| `014_profile_fields_and_deletion` | `home_area`, `utr_profile_link`, `gpa`, `deletion_requested_at` (soft-delete, 30-day grace, no hard-delete code exists). |
| `015_family_overview_and_budget` | Parent read-access to `utr_entries`; `season_budgets`/`budget_expenses` tables. |
| `016_recruiting_checklist` | Real checklist-state table for `/plan`. |
| `017_coach_outreach_reply_note` | Optional `reply_note` on outreach rows. |
| `018_revoke_anon_execute_security_definer` | First attempt at revoking `anon` access to 5 helper functions — **didn't actually work**, see `020`. |
| `019_rls_policy_hardening` | Added missing `to authenticated` scoping across ~20 policies; added `is_parent_member()`; fixed the budget-write-by-player bug. Must be applied together with `018`/`020` (in the order 019 → 018 → 020). |
| `020_security_definer_execute_fix` | The real fix for `018`'s gap (Postgres grants EXECUTE to `PUBLIC` by default; revoking from `anon` specifically does nothing unless the grant was direct). Also caught and fixed a 7th vulnerable function, `rls_auto_enable()` (a Supabase-platform event trigger, not from this project's own migrations), which turned out to have its own direct grants separate from the PUBLIC default. **Two extra tiny fixes were applied live but only exist as documented comments inside this file, not as separate numbered local `.sql` files** — a real gap between local tracking and live state; if you ever rebuild this database from scratch, read `020`'s comments carefully, don't just run the `alter`/`revoke` statements at the top. |
| `021_performance_rls_and_indexes` | Fixed all 55 `auth.uid()`-per-row RLS performance warnings, added 14 missing FK indexes, de-duplicated 8 of 10 redundant-policy tables (2 left alone on purpose — `profiles`' 3-way SELECT overlap and `utr_entries`' owner/family dual-read — both correct multi-policy designs, not bugs). |

---

## F. Decisions — do not undo these

These were each argued through carefully this session. Don't relitigate
them without a real reason, and if you do change one, say so explicitly
rather than silently drifting back.

- **No generated or made-up data, anywhere.** If real data doesn't exist
  for something, show an honest empty/"Not tracked" state and say what's
  missing. This is the single most-repeated rule of the whole project.
- **No generated coach emails or fabricated outreach content.** The real
  `buildCoachEmail()` (`lib/db/schools.ts`) builds drafts from the
  player's own real logged match wins — never invents a match result. BUT
  — see TODO §H.1 — the `coachName`/`coachEmail` fields themselves live in
  a static seed catalog (`lib/db/schools-data-*.ts`) that was never
  verified against a real staff directory. That's flagged as unfinished
  business, not a solved problem.
- **4-band fit model**: Likely / Target / Reach / Out of range, exactly as
  described on `/methodology`, implemented in `lib/school-fit.ts`'s
  `classifySchoolFit`. Reach-vs-Out-of-range is decided by projecting the
  player's real UTR trajectory forward, never a static snapshot comparison.
- **"Leaving" counts are facts, never "open spots."** The real methodology
  explicitly rejects "2 open spots" framing in favor of "2 seniors leave
  before you'd arrive" — a real, derivable fact from grad-year math, not a
  guess about roster availability.
- **5-item nav**: Today, Plan, Schools, Outreach, Events. Settings and
  Family live under the avatar menu, not the main nav. Don't add a 6th
  top-level item without a real reason.
- **Friends and badges are removed, product-wide** — not hidden, deleted
  (routes, views, nav entries, award logic). The underlying `friendships`/
  `badges` tables and their RLS still exist (locked down) but nothing
  writes to them. Don't resurrect either feature without being asked.
- **No auto-generated training plans — manual calendar only.** This one is
  currently **violated** by existing code (the "Build a real week" setup
  wizard still auto-generates a full templated week of sessions) — see
  TODO §H.2. Flagging the decision here so it doesn't get re-approved by
  accident; the fix is still pending, not done.
- **Gmail = compose-link only.** `/outreach`'s "Open in Gmail" builds a
  real `https://mail.google.com/mail/?view=cm&...` URL and opens it in a
  new tab. There is no Gmail API integration, no inbox access, no reading
  or sending mail on the user's behalf, ever.
- **UTR = profile link + manual check-in only.** The app stores a
  `utr_profile_link` (validated to be a well-formed `app.utrsports.net`
  URL, never fetched or scraped) and relies entirely on the player typing
  their own current UTR into the app (onboarding, the UTR drawer, or the
  Sunday check-in). No automated UTR lookup exists or should exist.
- **Parents are read-only except the budget.** The one thing a parent can
  write that a player can't is the season budget/expenses. Everything else
  parent-visible is read-only (enforced in the UI and, since this session,
  at the RLS layer too).
- **Under-13 needs a parent-created account.** Checked client-side at
  onboarding (birth year → age), routes to the real `/parent-signup` flow
  rather than letting a child self-serve-sign-up.
- **The 11 (now 18) mockups in the Seeded Claude project
  (`claude/design/*.dc.html`, or the exported PNG set under
  `/tmp/seeded-mockups-png/` from this session if you still have access to
  that scratch directory) are the source of truth for UI.** Pixel-match
  them; if something in a mockup seems wrong, build it as shown and say so
  in a note — don't silently "improve" it.

---

## G. Current state

**Built and verified this session** (all pixel-checked against the real
mockups, all backed by real data, all with passing tests): the full public
site (`/`, `/pricing` shell, `/onboarding`), the full 5-item app shell
(sidebar + mobile tab bar), all 5 primary app screens (`/today`, `/plan`,
`/schools`, `/schools/[slug]`, `/outreach`), `/events`, `/tournament-fit`,
`/methodology`, `/sample-report`, `/settings` + `/settings/billing`,
`/family` + sub-routes, a real dark mode, the 4-band fit classifier with
full "why this band"/"what would change it" explanations, a what-if UTR
slider, star-to-target with undo, keyboard shortcuts on `/schools`, a real
interactive week-view calendar with drag/resize/repeat, a real Sunday
check-in, the full `lib/db/` typed data layer with zod-validated write
routes, real generated Supabase types, and a full security/performance
pass on the live database (see §E).

**Test count:** 382 passing (`npx vitest run`), across 28 test files. All
are pure-logic unit tests (classification math, date math, validation
schemas, narrowing helpers) with mocked Supabase clients where needed —
**none require real env vars or a live database connection to run.**

**Known bugs:** none currently open that I'm aware of. Several real bugs
were found and fixed along the way this session (a mislabeled out-of-range
fit chip, a UTR-level label bug in the tournament scorer, a gender-param
bug in the Compare deep link, an off-screen modal on narrow viewports, a
fabricated-data roster chart swapped for a real one, two RLS gaps) — all
confirmed fixed, not re-opened.

**Half-done / explicitly left incomplete** (see TODO §H for the fix, this
is just the honest current-state description):
1. **Coach names/emails are unverified seed data**, not sourced from a real
   staff directory. They render in outreach drafts today. TODO §H.1.
2. **The training setup wizard still auto-generates a full week** of
   templated sessions (6 sessions, formulaic titles like "Serve pattern
   block") on first use — contradicts decision F's "manual calendar only."
   TODO §H.2.
3. **Google sign-in has no `/auth/callback` route.** `signInWithGoogle()`
   calls the real `supabase.auth.signInWithOAuth()`, but `redirectTo` is
   just the current page URL, relying on implicit-flow session detection
   rather than a proper PKCE code-exchange route. Untested end-to-end
   (would need the Google provider actually enabled in Supabase's
   dashboard, which per the user's own TODO note it now is). TODO §H.3.
4. **Pricing page shows the old $19/$39 flat prices**, not the mockup's
   $12/$99 and $19/$159. TODO §H.5.
5. **Roster data is still the original static seed catalog**
   (`lib/db/schools-data-*.ts`) — real-looking but not sourced from the
   College Tennis UTR Database sheet or the official-rosters TSV. TODO
   §H.6.
6. **"Set alert" and "Share recruiting page"** — confirmed via a fresh
   repo-wide grep: zero references anywhere. Correctly never built, not a
   bug. TODO §H.7 only applies if someone decides to build them for real.

**Every "Not tracked"/empty state and why:**
- Schools table's **Openings** and **Data/verification** columns — no
  seniors-leaving field, no roster-verified-date field exist on `School`.
  These columns auto-hide when every visible row would show "Not tracked",
  and reappear automatically the moment real data exists for any row.
- Schools table's **Academics** column is real, not empty — derived from
  the real `usNewsRanking` field via `lib/school-academics.ts`.
- School profile's **roster list** shows a real aggregate UTR range
  (`schoolUtrRange()`), not individual players — no per-player roster data
  exists. The mockup's own caption admits its player table is placeholder
  data, so this isn't a gap relative to the spec, just relative to a fully
  "real" experience.
- `/plan`'s **UTR confidence band** on the trajectory chart is honestly
  omitted under 3 logged UTR entries (real regression needs a minimum
  sample), never faked with "Log more results to see your pace" shown
  instead.
- `/plan`'s checklist dropped 3 of the mockup's 5 items ("Highlight video",
  camps/showcases detail, "plan spring events") since no real app state
  backs them — only "Save 10+ schools" and "Email N target coaches" are
  real, checkable booleans.

---

## H. TODO, in priority order

1. **Remove generated coach names/emails from outreach drafts.** The
   underlying static catalog (`lib/db/schools-data-*.ts`) has
   `coachName`/`coachEmail` fields that were never verified against a real
   staff directory. Either strip these fields from outreach-facing UI
   until real data exists (replace with a real "find the staff directory"
   link, same pattern already used on `/schools/[slug]`'s Coaching Staff
   card), or treat this as part of the roster-import project (§H.6) since
   that's the real fix — don't invent a second, parallel real-coach-data
   source.
2. **Remove the training setup wizard.** The "Build a real week for
   {name}" flow (triggered from Events' "Add session" when no training
   plan exists yet — check `components/training/training-view.tsx` and
   whatever calls it from the Events drawer) auto-generates a full
   templated week. Replace with the already-real single-session
   add/edit/delete/drag/resize/repeat flow the Events calendar card
   already has — a brand-new user should land on an empty calendar, not a
   wizard that writes 6 sessions for them.
3. **Google sign-in, done properly.** Build a real `/auth/callback` route
   (server component or route handler, `supabase.auth.exchangeCodeForSession`
   for PKCE), wire real onboarding for a brand-new Google sign-up (they
   skip the email/password form entirely, still need role/birth-year/
   target-schools), handle account linking if a Google email matches an
   existing password account, and add the Google button to the standalone
   `/login` page (it may currently only exist inside the pre-auth
   onboarding flow — check before assuming). Google is already enabled in
   Supabase's dashboard per the user.
4. **Merge this branch to `main`.** Only after the above (or an explicit
   decision to defer some of them) — remember `main` auto-deploys to
   production with no staging gate.
5. **Pricing page + Whop price changes.** Update Whop's actual plan
   configuration to match the mockup ($12/mo or $99/yr Player, $19/mo or
   $159/yr Family), then update the 3 hardcoded price locations (§A) and
   build the real yearly/monthly toggle UI. Do the Whop-side change first
   — shipping new UI copy before the real prices match would be the
   bait-and-switch this project explicitly avoided everywhere else.
6. **Roster import** from the "College Tennis UTR Database" Google Sheet +
   `claude/official_rosters_2026-27.tsv` (10 more conferences, no UTR yet).
   Build `teams`/`players` tables (migration `012` — this number has been
   reserved for this exact purpose the whole project, never used for
   anything else), a re-runnable import script in `scripts/import-rosters`
   so it can be re-run after each research session without duplicating
   rows, wire `/schools` and school pages to read from these tables instead
   of the static catalog. **Do not commit the raw roster/UTR data to the
   repo** — it's public but the import script should read it from files
   passed in at runtime, not bake it into source. Do not apply migration
   `012` or run the import against the live database without explicit
   sign-off — same discipline every other migration this session followed.
7. **"Set alert" and "Share recruiting page"** — only build these if
   there's a real feature behind them (a real notification system, a real
   shareable recruiting profile page). Don't add UI for either without
   that real backing — they were correctly left out everywhere this
   session specifically because nothing real exists yet.

---

## I. Gotchas

- **Postgres grants EXECUTE to `PUBLIC` by default.** `REVOKE EXECUTE ON
  FUNCTION x() FROM anon` does **nothing** if `anon`'s access actually
  comes from the `PUBLIC` default rather than a direct grant — you have to
  `REVOKE ... FROM PUBLIC` and then explicitly re-grant to whichever roles
  legitimately need it. Cost us a whole extra migration (`020`) to get
  right; verify with `has_function_privilege('anon', 'fn()', 'EXECUTE')`
  after any revoke, don't trust the migration "succeeding" as proof it
  worked.
- **Some functions/objects have DIRECT grants to specific roles, not just
  the PUBLIC default** — `rls_auto_enable()` and `set_updated_at()` both
  turned out to have explicit per-role grants (check via
  `aclexplode(proacl)` on `pg_proc`) that a `REVOKE ... FROM PUBLIC` alone
  doesn't touch. Always check the real ACL, don't assume one revoke
  pattern covers everything.
- **Local dev points at the SAME Supabase project as production.** No
  separate dev project exists (this is itself TODO-adjacent but wasn't
  tackled this session — it's the original "Future tasks" item in the old
  CLAUDE.md). Never sign in through real auth locally without being
  certain you're using a clearly-fake, disposable account, and delete it
  (and every row it touched, checking for `NO ACTION`-not-`CASCADE`
  foreign keys like `season_budgets.updated_by`) immediately after testing.
  The `/dev/*-preview` harnesses exist specifically to avoid needing real
  auth for everyday testing.
- **Stale `.next` dev-cache issue.** A webpack/SWC error like "Cannot find
  module './NNNN.js'" after a lot of file churn is a known flaky caching
  issue, not a real bug — `rm -rf .next` and rebuild before chasing it as
  a code problem. Hit repeatedly this session, always resolved this way.
- **`next/font` Google Fonts sandbox network errors** occasionally fail a
  build with `Cannot read properties of null (reading '1')` — confirmed via
  `git stash` reproduction to be a sandbox/network issue unrelated to any
  code change, not something to debug as a regression.
- **Supabase MCP connectivity drops transiently.** Hit `net::ERR_FAILED`
  on `list_projects`/`get_advisors` more than once this session, always
  resolved on retry a short time later. If every Supabase MCP call fails,
  wait and retry before concluding something is broken.
- **The available agent/tool surface can change mid-session** (background
  agent types disappearing, browser tool namespaces changing, new MCP
  servers connecting/disconnecting). Not a code issue, but worth knowing
  if a sub-agent call suddenly errors with "agent type not found" or
  similar — check what's actually available before assuming a regression.
- **Tests need no real env vars or live DB** — all 382 are pure-logic unit
  tests with Supabase clients mocked at the call site. If you ever add a
  test that genuinely needs Supabase connectivity, that's a new pattern
  for this repo, think carefully before introducing it.

---

## J. Production rollout plan — P0-1, P0-2, P1-PRICE-1 (written 2026-11-14)

Everything below is **already applied and tested on staging**
(`gnlcpnsweqbtwpaqhqqg`), never on production. Production
(`tfpjssmhiptbwigarxpx`) is untouched by this work.

**Current production state:** serving the maintenance page since
2026-11-14 (`main` @ `d059006`, verified live: 503 + `Retry-After: 3600` +
`X-Robots-Tag: noindex` on `/`, `/schools` and `/api/profile`). Users are
not hitting the app, which is what makes this rollout low-risk — but it
also means **the clock is running**, so don't sit in this state longer
than needed.

### The one-paragraph version
Apply eighteen migrations to production in order
(025 → 022 → 023 → 026 → 024 → 027 → 028 → 029 → 030 → 031 → 032 → 033 →
034 → 035 → 036 → 037 → 038 → 039), verifying after each; then merge `v1` to `main` as a
single PR with CI green, having first merged `main` into `v1` and deleted
`middleware.ts` there — **`git revert d059006` cannot work and the plain
merge keeps the maintenance page; see step 15.** (This line said "twelve"
while listing eleven until 2026-11-15 — count the arrows, not the adjective.) The database changes go FIRST and
are all backwards-compatible with the code currently on `main`, so there
is no window where deployed code is talking to a schema it doesn't
understand. Code goes last.

### The 2026-11-15 dress rehearsal — what it proved and what it changed

This whole plan was executed end to end against a database rolled back to
production's exact 23-migration shape, seeded with prod-shaped fake data (an
account with no family, a parent holding a family code, a player who JOINED
that family, a minor, and an account carrying a `whop_membership_id`). Every
documented rollback was run first, in reverse order, to get there.

**Measured database time for the whole forward rollout: 218 ms.** Per step:

| Step | Migration | Forward | Documented rollback |
|---|---|---|---|
| 1 | 025 | 30.2 ms | n/a (no-op) |
| 2 | 022 | 9.3 ms | 35.4 ms |
| 3 | 023 | 29.4 ms | 24.9 ms |
| 3 | 026 | 17.9 ms | (same step) |
| 4 | 024 | 5.7 ms | 7.7 ms |
| 5 | 027 | 4.5 ms | 1.5 ms |
| 6 | 028 | 15.6 ms | 10.6 ms |
| 7 | 029 | 1.0 ms | 1.8 ms |
| 8 | 030 | 68.8 ms | 13.2 ms |
| 8 | 031 | 4.3 ms | (same step) |
| 9 | 032 | 4.6 ms | 9.9 ms |
| 10 | 033 | 7.3 ms | 17.8 ms |
| 11 | 034 | 19.2 ms | 20.7 ms |
| 12 | 035 | not separately timed | re-proved 2026-11-15 (23503 returns) |
| 13 | 036 | not separately timed | re-proved 2026-11-15 (2BP01 ordering) |
| 14 | 037 | not separately timed | written 2026-11-15, not yet re-proved |

The second rehearsal (2026-11-15, after 036) measured wall-clock per step
from the client rather than database time, so it is not comparable with the
figures above and is deliberately not tabulated as if it were. The number
that matters has not changed: the elapsed SQL is not the risk, the
verification between steps is.

The elapsed time is not the risk; **the verification between steps is**. Plan
the window around reading results, not around waiting for SQL.

**Checks that passed on prod-shaped data, as written:**
- Production has exactly 23 applied migrations. ✓
- Step 3: all 4 pre-existing `parent_accounts` rows backfilled to `approved`,
  zero `pending`, count matching the pre-count. ✓
- Step 4: zero free accounts already holding more than 3 targets. ✓
- Step 5: 1 row with `privacy_level='public'` — the one named row. ✓
- Step 6: `consume_rate_limit('data_export')` → 3 allowed, 4th denied with a
  `retry_after_seconds`. ✓
- Step 7: zero profiles with `deletion_requested_at` set on this database.
- **Step 8's mandatory pre-flight: every row `not_required`, zero
  `pending`.** Nobody is locked out. ✓ — 12 of 12 on staging. **On production
  expect 8 of 8**: it has 8 profiles to staging's 12, so do not let the
  rehearsal's number make a correct 8 look wrong. The column does not exist
  until 030 creates it with `default 'not_required'`, so this check runs
  immediately after 030 and before 031, not before the step.
- Step 9: the takeover INSERT raises `42501`; creating a family with a fresh
  code still works. ✓
- Step 10: a player member writing a "parent" note is refused `42501`; an
  approved parent still can. ✓
- Step 11: exactly 20 direct `utr_entries` writes allowed, the 21st refused.
  ✓

**Four defects in this plan, found by running it:**
1. **Step 8's rollback did not execute at all** — `create or replace` cannot
   restore the 8-column `family_members()` over 031's 9-column version
   (`42P13`). It needs a `drop function` first. Fixed above.
2. **Step 4's rollback created a policy production does not have.** Fixed
   above.
3. **Step 3's rollback never mentioned `family_join_attempts`**, a table 023
   creates. Fixed above.
4. **Restoring a dropped SECURITY DEFINER function re-grants EXECUTE to
   PUBLIC.** `CREATE OR REPLACE` keeps the old grants; a fresh `CREATE` after
   a `DROP` does not. The rehearsal did this to `are_friends()` and only
   noticed by diffing function ACLs against production. Every restore in this
   document now carries its `revoke`/`grant` pair.

### The THIRD rehearsal (2026-11-15) — the one that started from production's real shape

The first two rehearsals rolled staging back and replayed forward, and both
started from a database that was *close* to production. This one started from a
database that was **byte-identical** to it, and that is the only reason it
found anything.

**How the starting state was built, and why it matters.** The documented
rollbacks restore BEHAVIOUR, not SCHEMA — which this file says, and which means
a rolled-back database still carries 17 extra functions and 8 extra columns the
forward migrations created. A forward run from there cannot tell you whether a
migration that CREATEs something would have failed on production, because the
object is already there. So after running every rollback in reverse (steps
14 → 2, all clean), the leftovers were removed and production's own objects
restored, until a **nine-category fingerprint matched production exactly:
9 of 9** (columns, constraints, policies, indexes, triggers, functions,
function grants, table grants, RLS flags — functions and grants compared with
whitespace stripped and ACLs sorted, because `pg_proc.prosrc` keeps the
original formatting and `proacl` keeps grant order).

Then it was seeded to production's **data** shape rather than a convenient one:
8 profiles, 3 `parent_accounts` rows **all double-linked** (the user's own
`profiles.family_code` is the same code), 6 families, 2 `family_codes` rows,
15 `utr_entries`, 1 `privacy_level='public'` profile, and **one family with 4
profiles sharing a single code** — production's `NIRAN-0FI8`.

**Three more defects in this plan, and one in the product, all found by running
it rather than reading it:**

5. **Step 14's rollback left `family_account_holder()` behind.** Harmless
   (it is granted to nobody) but it is schema drift from production, and the
   whole point of the fingerprint is that drift is detectable. The `drop` is in
   the step now.
6. **`family_members_read` and `utr_entries_select_family` never get back to
   production's definition.** Step 13's rollback restores the 023/027 form
   (`is_family_member(family_code)`), which is correct at that point in the
   reverse chain — but neither step 5's nor step 3's rollback then puts them
   back to what production actually has, which is
   `family_code = current_family_code()`. `current_family_code()` is
   `select family_code from profiles where id = auth.uid()` — the creator's
   own column only — so `is_family_member()` is **strictly broader**: it also
   matches through `parent_accounts`. A full rollback would therefore leave
   production with a WIDER family read than it started with. Not a
   catastrophe, and still inside one family, but a rollback whose job is to
   land exactly where you were.
7. **Step 5's rollback of `profiles_discovery_read` omits
   `are_friends((select auth.uid()), id)`**, which production's policy has. In
   the other direction this time: the restored policy is narrower. Harmless
   because friends are gone product-wide and no code reads it — but it is not
   production's policy, and "harmless" is a judgement the next person should
   get to make with the real text in front of them.
   Both 6 and 7 are written out as runnable SQL in their steps now.
8. **The product defect: the family roster returned every double-linked member
   twice, and called three of them "account holder".** See step 14b and
   migration 038. This is the one that would have shipped: it is invisible in
   any seed where creators and joiners are disjoint, which is every seed this
   project used before today.

**And one claim in this plan that the real shape contradicts.** Step 13 says
036 fixes a read gap where "the creator-parent of `FAKEFAMILY01` saw 1 profile
(their own) and 0 of the joined player's 3 `utr_entries` rows". True for that
seed. **Not true for production's members:** the pre-036 policy keyed off the
ROW OWNER's `profiles.family_code`, and every one of production's family
members carries it, so they can read each other today. Re-measured on the
prod-shaped seed: a pure joiner (profile code NULL, approved link) read 5
profiles, 10 `utr_entries` and 2 matches **before** 036. The gap is real but it
bites rows owned by a member who joined by code and never had the column set —
on production, nobody yet. 036's read half is therefore a fix for FUTURE
joiners, not a repair of something broken for today's users; **037's narrowing
is the part that changes what production's existing members can see.** Worth
being exact about, because the launch note said otherwise.

The WRITE half does reproduce exactly as documented: via the app's own path
(stamping `family_code` from the writer's `profiles.family_code`), a joined
parent's `encouragement_notes` insert is refused `42501`, and their match is
stamped NULL and then unreadable by their own family (a parent read 0 of it).
After 036 both work and the database does the stamping; a client trying to
publish into a stranger's family gets its own code stamped on instead.

**Every documented rollback ran clean in reverse order (14 → 2),** and the two
the launch gate names were re-proved behaviourally rather than by inspection:
- **032:** after its rollback, a client INSERT of a profile carrying someone
  else's family code **succeeded** — the Critical is genuinely reopened, which
  is what a correct rollback of 032 means.
- **035:** after its rollback `consume_rate_limit` is back to 028's inline
  policy and `delete_my_account()` to 029's body, `profile_row_exists()` is
  deliberately left in place, and an ordinary profile upsert still works —
  i.e. the rollback does not re-break what it was rolled back from.
- **037:** after its rollback, `family_members()` is 9 columns again, the
  cross-user `profiles` policy is back, and `remove_family_member()` no longer
  clears the profile column.

**The forward run, from the 9-of-9 starting state, was clean at every step**,
including the two steps whose verifies are the real gate: step 8's
`consent_status` census came back **10 of 10 `not_required`, zero `pending`**,
and step 1 (025) left the fingerprint still **9 of 9** — the first time this
plan has been able to prove 025 is a true no-op on production's shape rather
than assert it.

**Two false signals the harness produced, recorded so they are not mistaken
for findings.** A `42501` "permission denied for table probe_result" and a
`53400` "Too many changes at once" both came from the test harness, not the
migrations: the first from a temp table granted to `authenticated` but queried
as `service_role`, the second from `set_config('request.jwt.claims', ...,
true)` persisting across `DO` blocks in one transaction so that setup INSERTs
run as `postgres` were still rate-limited against the previous user's bucket.
Reset the claims between blocks, and grant temp tables to every role you switch
into.

**Two things to understand before trusting any "verify" step:**

- **In the Supabase SQL editor you are `postgres`, and `postgres` bypasses
  RLS.** A verify that counts rows will happily return everything and look
  like a pass. `set_config('request.jwt.claims', ...)` alone does NOT fix
  this — it sets `auth.uid()` but leaves you as a superuser. Run checks like
  this:
  ```sql
  begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
  -- ... the check ...
  rollback;
  ```
  With the role switch, an approved parent sees **1** profile row. Without
  it, 12. The rehearsal hit this and briefly recorded the wrong number.
- **These rollbacks restore BEHAVIOUR, not SCHEMA.** After running every
  documented rollback, the database still differed from the pre-rollout
  baseline by 16 functions, 13 columns, 7 constraints, 4 indexes and 1 table
  — all of it additive and inert, exactly as each step says. That is the
  right trade for an incident, but it means **"rolled back" never means
  "back to how it was."** The only true restore is the PITR checkpoint from
  the pre-flight. Take it.

**One ledger difference worth knowing:** production has a migration staging
does not (`rls_auto_enable_revoke_direct_grants`, 20261110210151 — three
`revoke execute` lines). The resulting ACLs are byte-identical on both, so
the schema fingerprint cannot see it; only `list_migrations` can. Staging is
a faithful schema clone with a shorter history.

### Pre-flight (do all of these before touching production)
- [ ] `verify` CI job green on `v1` (P1-OPS-1; branch protection on `main` set up)
- [ ] Take a fresh production backup / PITR checkpoint. Supabase → Database → Backups. **Note the timestamp here: ______**
- [ ] Confirm production still has exactly 23 applied migrations (`list_migrations`); if it has more, someone changed it and this plan is stale
- [ ] Re-run the schema fingerprint on prod and staging. Expect them to differ ONLY by the migrations staging has and prod does not — if anything else differs, stop. **Measured 2026-11-15:** with staging rolled back to the 23-migration shape, 23 of 23 tables matched production column-for-column, and 5 of the 9 fingerprint categories matched byte-for-byte. The other four (functions, function grants, policies and one column default) differed only because of objects recreated by hand during the rehearsal, each tracked down to parity. Do not expect a clean 9/9 unless nothing has been hand-restored
- [ ] Have the rollback SQL ready **and know that running all of it still does not return the schema to its pre-rollout shape** — see the rehearsal section above. The PITR checkpoint is the only real undo
- [ ] Confirm the Whop webhook's service-role path is understood: 022 and 024 both exempt `service_role`, so billing writes keep working
- [ ] Have the rollback SQL for each step pasted into a scratch buffer BEFORE you start

### Step 1 — migration 025 (reconcile profiles schema drift)
**What:** tightens `profiles` to the definition production already has.
**Expected effect on production: NONE.** Every statement is guarded and
production already satisfies all of them. It is in this list so prod and a
repo-built database converge, not because prod needs it.
**Apply:** `supabase/migrations/025_reconcile_profiles_schema_drift.sql`
**Verify:** the verification block at the bottom of the file returns zero rows; schema fingerprint unchanged from before the step.
**Rollback:** nothing to roll back — it is a no-op on prod. If it somehow
alters something, restore from the pre-flight backup.
**Risk: very low.**

### Step 2 — migration 022 (P0-1: lock privileged profile columns)
**What:** a `BEFORE INSERT OR UPDATE` trigger on `profiles` that rejects
client changes to `subscription_tier`, `role`, `family_code`,
`whop_membership_id`, `stripe_*`. Exempts `service_role`/`postgres`/`supabase_admin`.
**Apply:** `supabase/migrations/022_lock_privileged_profile_columns.sql`
**Verify (as a real authenticated user, not postgres):** all four
escalations rejected with `42501`; a normal `name` edit still succeeds.
Then confirm the Whop webhook can still upgrade a test account.
**Rollback:**
```sql
drop trigger if exists profiles_protect_privileged on public.profiles;
```
The function can stay; the trigger is what enforces.
**Risk: low, and instantly reversible.**
**Known behaviour change:** `family_code` becomes unchangeable on UPDATE
from the client. A player who signs up without a family and later creates
one must go through a server-side path. Check this against the live signup
flow before shipping the code in step 12 — it is fine for existing users.

### Step 3 — migrations 023 + 026 (P0-2: join_family RPC and the approval flow)
**What:** pending/approved state on `parent_accounts`; `families` readable
by members only; no direct `parent_accounts` INSERT; `join_family()` and
`approve_family_join()` RPCs; rate limiting; `generate_family_code()`;
family-read policies switched to `is_family_member()`.
**This is the only step that changes behaviour for existing users.**
It backfills every existing `parent_accounts` row to `'approved'`, so
nobody currently linked is locked out. **Verify the backfill count matches
the row count before you proceed.**
**Apply BOTH, in order:** `023_family_join_rpc.sql`, then
`026_family_approval_flow.sql`. They are one logical unit — 023 makes
joining safe, 026 makes the resulting family usable (approve / deny /
roster / remove / remind). Applying 023 alone leaves nobody able to approve
anyone.
**Verify:**
```sql
select status, count(*) from public.parent_accounts group by status;
-- expect: every pre-existing row 'approved', zero 'pending'
```
then the attack suite: stranger sees 0 families; direct `parent_accounts`
insert rejected; `join_family` on a valid code returns `pending`; a pending
link reads nothing; rate limit fires on attempt 6; an approved parent CAN
read the child's UTR history.
**Rollback:** (made runnable by the 2026-11-15 dress rehearsal — the helper
restore used to be a sentence, and the dropped table was not mentioned at all)
```sql
drop policy if exists families_readable_by_members on public.families;
-- Guarded so a second run does not fail 42710. Every other block in §J has
-- this; these two did not, and a rollback you cannot re-run is a rollback you
-- cannot trust at 3am.
drop policy if exists "families readable" on public.families;
create policy "families readable" on public.families
  for select to authenticated using (true);
drop policy if exists "parent_accounts_insert_self" on public.parent_accounts;
create policy "parent_accounts_insert_self" on public.parent_accounts
  for insert to authenticated with check (user_id = (select auth.uid()));

-- The pre-023 helpers, verbatim from PRODUCTION's own definitions
-- (pg_get_functiondef on 2026-11-15). The difference 023 introduces is the
-- `and pa.status = 'approved'` clause; these are the versions without it.
create or replace function public.is_family_member(target_family_code text)
returns boolean language sql stable security definer set search_path to 'public'
as $fn$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.family_code = target_family_code)
      or exists (select 1 from public.parent_accounts pa
                 where pa.user_id = auth.uid() and pa.family_code = target_family_code)
$fn$;

create or replace function public.is_parent_member(target_family_code text)
returns boolean language sql stable security definer set search_path to 'public'
as $fn$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.family_code = target_family_code
                   and p.role = 'parent')
$fn$;

-- 023 also creates this table. The old comment here said "nothing else
-- references it" — WRONG: `join_family()` both reads and writes it
-- (023_family_join_rpc.sql, the rate-limit count and the attempt log). This
-- rollback leaves the RPCs in place, so dropping the table leaves a
-- `join_family()` that raises 42P01 on every call. Harmless only because the
-- rolled-back CODE no longer calls it. Drop the function first, in this
-- order, so nothing is left half-working:
drop function if exists public.join_family(text);
drop table if exists public.family_join_attempts;

-- 023 REWROTE these two policies to use is_family_member(). Production's own
-- versions key off current_family_code() instead, which is
-- `select family_code from profiles where id = auth.uid()` — the creator's own
-- column only. is_family_member() also matches through parent_accounts, so
-- leaving 023's version applied leaves production with a BROADER family read
-- than it started with. (Rehearsal 3 defect 6: nothing in the reverse chain
-- put these back. Verbatim from production, 2026-11-15.)
drop policy if exists "family_members_read" on public.profiles;
create policy "family_members_read" on public.profiles
  for select to authenticated
  using ((family_code is not null) and (family_code = public.current_family_code()));

drop policy if exists "utr_entries_select_family" on public.utr_entries;
create policy "utr_entries_select_family" on public.utr_entries
  for select to authenticated
  using (exists (
    select 1 from public.profiles owner
    where owner.id = utr_entries.user_id
      and owner.family_code is not null
      and owner.family_code = public.current_family_code()));
```
**The `status`/`approved_at`/`approved_by` columns and the RPCs can stay** —
see below. `create or replace` on the two helpers preserves their existing
grants, so no re-grant is needed here (unlike a DROP + CREATE, which does not
— see step 8).
**The `status`/`approved_at`/`approved_by` columns and the RPCs can stay —
they are additive and harmless once the policies are back.** Do not drop
them in a hurry; dropping columns is the only irreversible move here.
**Risk: medium — it is the one with a real behaviour change.** Roll back
by restoring policies, not by dropping columns.

### Step 4 — migration 024 (P1-PRICE-1: pricing gates)
**What:** `coach_outreach` writes move from `has_tier('family')` to
`has_tier('player')`; a trigger caps Free accounts at 3 target schools.
**Order matters:** this must land BEFORE the step-5 code, because the `v1`
code already gates outreach at Player. Shipping the code first would give
Player-tier users an outreach board that fails every write.
**Apply:** `supabase/migrations/024_tier_gating_outreach_player_free_targets.sql`
**Verify:** Free user blocked from `coach_outreach` insert; Player-tier
user allowed; Free user allowed 3 targets and blocked at 4; Player allowed
8; a downgraded user with 8 can still prune to 5.
**Check first:** any existing Free account already holding >3 targets keeps
them (the trigger only blocks *growth*), but cannot add more until they
prune. Count them before shipping so the support answer is ready:
```sql
select count(*) from public.profiles
where subscription_tier='free' and coalesce(array_length(target_school_slugs,1),0) > 3;
```
**Rollback:** (corrected by the 2026-11-15 dress rehearsal — the old text
recreated a policy production does not have)
```sql
drop trigger if exists enforce_free_tier_target_limit on public.profiles;
drop policy if exists coach_outreach_write_own on public.coach_outreach;
```
**Do NOT recreate `coach_outreach_write_own`.** 024 is what CREATES it;
before 024 there is no such policy. Production's pre-024 writes are covered
by `coach_outreach_write_own_insert` / `_update` / `_delete` from migration
010, which already require `has_tier('family')` and which 024 never touches.
The previous version of this rollback created a fourth, broader `FOR ALL`
policy, leaving production in a state it has never been in. Verified on a
prod-equivalent baseline: no `coach_outreach_write_own` existed, and applying
024 created it.
**Risk: low, instantly reversible** — but if you roll this back you must
also roll back the step-12 code, or the UI offers outreach the DB refuses.

### Step 5 — migration 027 (S-5 narrow profile reads + S-9 RPC grants)
**What:** drops `profiles_discovery_read`, which let any signed-in user read
the WHOLE row — email, GPA, grade, family_code, Whop and stripe ids — of any
profile with `privacy_level='public'`. Also locks the dead `badges` and
`friendships` tables (RLS on, no policies), drops `are_friends()`, and
revokes `authenticated` EXECUTE on `current_family_code()` and
`generate_family_code()`.
**Check first — this is the only step with a named production row:**
```sql
select id, name from public.profiles where privacy_level = 'public';
-- 1 row at the 2026-11-10 audit. That person loses nothing they use
-- (there is no public page), but they are the only user whose stored
-- preference stops meaning anything.
```
**Apply:** `supabase/migrations/027_narrow_profile_reads_and_rpc_grants.sql`
**Verify (as a stranger account):** `select count(*) from public.profiles`
returns 1 (their own row) — not 2. `badges` and `friendships` return 0.
`current_family_code()` and `generate_family_code()` raise `42501`.
Then as an approved parent: the child's profile, the family row and the
child's UTR history all still read.
**Rollback:**
```sql
-- 027 DROPS are_friends(), and production's profiles_discovery_read CALLS it,
-- so the function has to come back before the policy can. (Rehearsal 3 defect
-- 7: the old text omitted both, leaving a policy narrower than production's.)
-- Verbatim from production, 2026-11-15.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $fn$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  )
$fn$;
revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

create policy profiles_discovery_read on public.profiles
  for select to authenticated
  using (privacy_level = 'public' or id = (select auth.uid())
         or public.are_friends((select auth.uid()), id)
         or family_code = public.current_family_code());
grant execute on function public.current_family_code() to authenticated;
grant execute on function public.generate_family_code() to authenticated;

-- 027 also drops the badges and friendships policies. Production has five of
-- them and a rolled-back database has none, which the fingerprint flags.
-- Restore them only if something needs them (nothing does — both features are
-- removed product-wide); they are listed here so the difference is a decision
-- rather than a surprise:
--   badges_read, badges_write_own, friendships_insert_self,
--   friendships_read_involved, friendships_update_involved.
-- badges/friendships policies: restore from migration 021's text if anything
-- actually needs them. `are_friends()` is gone; the badges policy that used
-- it would need rewriting, which is a sign you should not restore it.
```
**Risk: low.** Nothing in the app reads another user's profile outside a
family, so the only thing that can break is something nobody built.

### Step 6 — migration 028 (S-6 rate limits)
**What:** adds `rate_limit_events` (RLS on, no policies, grants revoked) and
`consume_rate_limit(bucket)`. Purely additive: nothing existing reads or
writes either, and no policy changes.
**Order:** can go before or after the code, but going FIRST is better — the
code fails CLOSED if the RPC is missing (`lib/rate-limit.ts`), so shipping
the code first would 429 every write route until this lands.
**Apply:** `supabase/migrations/028_api_rate_limits.sql`
**Verify:** call `consume_rate_limit('data_export')` four times as a test
user — three allowed, the fourth returns `allowed: false` with a
`retry_after_seconds`. A different user is unaffected. An unknown bucket
returns `allowed: false, reason: unknown_bucket`.
**Rollback:**
```sql
drop function if exists public.consume_rate_limit(text);
drop table if exists public.rate_limit_events;
```
Safe to drop — the table holds only counters, no user content. **But do not
roll this back while the step-12 code is live**: every write route would
then fail closed and the app would refuse all writes.
**Risk: very low on its own; coupled to the code in one direction only.**

### Step 7 — migration 029 (P0-8 real account deletion)
**What:** adds `delete_my_account()`. Additive — no policy or column
changes, and nothing calls it until the step-12 code ships.
**Apply:** `supabase/migrations/029_real_account_deletion.sql`
**Check first:**
```sql
select id, email, deletion_requested_at from public.profiles
where deletion_requested_at is not null;
```
Anyone in that list asked to be deleted under the old soft-delete flow and
is still owed a real deletion **by hand** — this migration does not action
them. Do it deliberately, with their confirmation, not as part of the
rollout.
**Verify on staging only, never on a production account:** the function
removes the auth user, every keyed row, and the family when the departing
account was its last member; a family with anyone left in it survives.
**Rollback:**
```sql
drop function if exists public.delete_my_account();
```
**This rollback restores the FUNCTION, not any data.** A completed deletion
is not reversible — that is the point, and it is what the UI says before it
runs. If you roll back the code without rolling back this, nothing calls it
and nothing happens.
**Risk: low to apply, permanent in effect once the code calls it.**

### Step 8 — migrations 030 + 031 (P0-8 under-13 parental consent)
**What:** `profiles` gains `birth_year`, `consent_status`,
`consent_granted_at`, `consent_granted_by`; the 022 trigger is replaced with
a version that derives `consent_status` from `birth_year` and makes
`birth_year` write-once from the client; `account_active()` plus a
RESTRICTIVE policy on 20 tables so a `pending` account reads and writes
nothing but its own profile row; `grant_parent_consent()`,
`my_consent_state()`; `approve_family_join()` also records consent;
`family_members()` gains `consent_status`.
**Apply BOTH, in order:** `030_under13_parent_consent.sql`, then
`031_family_roster_consent.sql`. 031 drops and recreates
`family_members()`, which the app calls — inside one migration, so no
deploy sees the gap, but they must not be split across deploys.
**Effect on existing users: none.** Every pre-030 account has
`birth_year = null`, `consent_required_for_birth_year(null)` is false, and
the INSERT branch of the trigger is the only thing that sets
`consent_status` — so every existing row stays `not_required` and
`account_active()` returns true for all of them. **Verify that, don't
assume it:**
```sql
select consent_status, count(*) from public.profiles group by consent_status;
-- expect: every row 'not_required', zero 'pending'
```
If a single row comes back `pending`, STOP and roll back — that account is
locked out.
**Also verify** a normal user can still read and write after the restrictive
policies land. This step touches every table's RLS; it is the highest-blast-
radius step in the whole plan.
**Rollback:**
```sql
do $$ declare t text; begin
  foreach t in array array['utr_entries','matches','coach_outreach',
    'tournament_entries','daily_checkins','cost_calculations',
    'recruiting_checklist_items','user_settings','training_plans',
    'workout_sessions','exercises','session_exercises','saved_templates',
    'encouragement_notes','parent_reports','season_budgets','budget_expenses',
    'family_codes','parent_accounts','families','profiles'] loop
    execute format('drop policy if exists account_active_required on public.%I', t);
  end loop;
end $$;
```
**Then restore the two functions. This half used to be a sentence, and the
sentence did not work:**
```sql
-- 42P13. 031 WIDENED the return type (eight columns -> nine), and
-- `create or replace` cannot change a function's OUT columns. The restore
-- MUST drop first. The forward migration 031 knows this and does it; this
-- rollback did not, so it failed on the first statement every time it was
-- run. Caught by the 2026-11-15 dress rehearsal.
drop function if exists public.family_members();
create function public.family_members()
returns table (user_id uuid, name text, email text, role text, status text,
               is_creator boolean, joined_at timestamptz, reminded_at timestamptz)
language sql security definer set search_path = public stable
as $fn$
  with fam as (select public.my_family_code() as code)
  select p.id, coalesce(nullif(p.name,''),'Family member'), p.email,
         coalesce(p.role,'player'), 'approved'::text, true,
         p.created_at, null::timestamptz
  from public.profiles p, fam
  where fam.code is not null and p.family_code = fam.code
    and public.is_family_member(fam.code)
  union all
  select pa.user_id, coalesce(nullif(p2.name,''),'Family member'), p2.email,
         coalesce(p2.role,'parent'), pa.status, false,
         pa.created_at, pa.reminded_at
  from public.parent_accounts pa
  join public.profiles p2 on p2.id = pa.user_id, fam
  where fam.code is not null and pa.family_code = fam.code
    and public.is_family_member(fam.code)
  order by 6 desc, 5, 7
$fn$;
-- NOT OPTIONAL. A function created fresh (as opposed to CREATE OR REPLACE'd)
-- gets EXECUTE for PUBLIC by default. Skipping these two lines silently hands
-- anon the family roster. The rehearsal did exactly that to are_friends()
-- and only caught it by diffing grants against production.
revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;

-- 022's version of the trigger function: no consent derivation, no birth_year
-- rules, no family_code INSERT guard.
create or replace function public.protect_privileged_profile_columns()
returns trigger language plpgsql security invoker set search_path = public
as $fn$
begin
  if current_user in ('service_role','postgres','supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;
    return new;
  end if;
  if new.subscription_tier      is distinct from old.subscription_tier
  or new.whop_membership_id     is distinct from old.whop_membership_id
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.role                   is distinct from old.role
  or new.family_code            is distinct from old.family_code
  then
    raise exception 'This profile field can only be changed by Seeded.'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

-- 030 also changes a column DEFAULT, which nothing else here restores.
alter table public.profiles alter column privacy_level set default 'friends';
```
Dropping the 21 restrictive policies alone is enough to unlock any account —
do that first if someone is locked out, and sort the rest afterwards. Leave
the new columns; they are additive and harmless.
**Risk: the highest in this plan.** Roll back by dropping policies, never by
dropping columns.

### Step 9 — migration 032 (CRITICAL: family takeover via profile INSERT)

**What:** blocks setting `profiles.family_code` on INSERT to a code that is
already taken. Found by an independent security review on 2026-11-15.

**The hole it closes.** 022 locks `family_code` on UPDATE; its INSERT branch
leaves it alone, and `profiles_insert_own` only checks `id = auth.uid()`.
`is_family_member()` reads `profiles.family_code` directly. So a signed-up
account with no profile row yet — which is every account between signup and
its first profile write, and any account that simply never makes one — could
INSERT a profile carrying **someone else's family code and `role='parent'`**
and become an approved member instantly. That buys the minor's name, email,
birth year, GPA, UTR and full UTR history, every family member's email and
`consent_status` including an under-13 sibling's, parent-level **write** on
the season budget, and the ability to send the child a note.

**The entire 023/026 pending-approval design was bypassed.** The only thing
that had been holding the door was `lib/auth.ts` politely not doing it — a
comment in that file asserted the database would reject it, and the database
would not. Prerequisite is knowing the 12-character family code, which is
not guessable but *is* the value the product hands to prospective joiners,
i.e. exactly the population the PENDING gate exists to hold back.

**Apply:** `supabase/migrations/032_block_family_code_on_profile_insert.sql`

**Verify:** as a signed-up user with no profile row, inserting a profile with
an existing `family_code` must raise `42501`. Then confirm all three
legitimate paths still work: creating a family with a fresh code, joining via
`join_family()` (still lands PENDING and reads nothing), and ordinary profile
updates. Verified twice on staging — once by the reviewer, once by me.

**Rollback:**
```sql
-- Restores 030's version of the trigger function: consent derivation and the
-- write-once birth_year rule, but no family_code INSERT guard. Spelled out
-- here because "restore 030's version verbatim" is not something anyone can
-- paste during an incident — the same defect that was found and fixed in
-- four other steps of this plan. Found and fixed 2026-11-15 (second pass).
create or replace function public.protect_privileged_profile_columns()
returns trigger language plpgsql security invoker set search_path = public
as $fn$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;
    new.consent_status := case when public.consent_required_for_birth_year(new.birth_year)
                               then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
    return new;
  end if;
  if new.subscription_tier      is distinct from old.subscription_tier
  or new.whop_membership_id     is distinct from old.whop_membership_id
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.role                   is distinct from old.role
  or new.family_code            is distinct from old.family_code
  then
    raise exception 'This profile field can only be changed by Seeded.'
      using errcode = '42501';
  end if;
  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;
  if old.birth_year is null and new.birth_year is not null then
    new.consent_status := case when public.consent_required_for_birth_year(new.birth_year)
                               then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
  else
    new.consent_status     := old.consent_status;
    new.consent_granted_at := old.consent_granted_at;
    new.consent_granted_by := old.consent_granted_by;
  end if;
  return new;
end;
$fn$;
revoke all on function public.protect_privileged_profile_columns()
  from public, anon, authenticated;

drop function if exists public.family_code_is_taken(text);
```
**This restores the 23502/42501 upsert bug 035 exists to fix.** 030's INSERT
branch runs on every `.upsert()` of an existing row, so after this, profile
writes fail again for anyone whose request omits `birth_year`. Only roll back
this far as part of rolling back steps 13→8 together.
**Risk: low to apply, and it is strictly a tightening** — it cannot affect an
existing row, only a new INSERT that claims a taken code.

⚠️ **This migration ships with the code whether or not it has been applied.**
It was swept into commit `3bc07ac` ("Task 6: E2E on staging…") by a `git add
-A` while the review was still running, so the file travels with any `v1` →
`main` merge under a commit message about end-to-end testing. Apply it in
this window; do not let the merge be the first time it appears on production.

### Step 10 — migration 033 (parent-only notes + birth year required)

**What:** two controls the product DESCRIBED but did not enforce. Found by
the independent verification pass on 2026-11-15.

1. **`encouragement_notes` INSERT really is parents-only.** The policy was
   named `encouragement_notes_insert_parent` and its WITH CHECK was
   `parent_id = auth.uid() AND is_family_member(family_code)` — "any approved
   member of this family", which says nothing about being a parent. A sibling
   player, or any approved joiner, could write a note the UI presents as
   coming from a parent. Nobody noticed because the policy's NAME asserted
   the rule its body did not implement, and both `CLAUDE.md` and the privacy
   policy inherited the claim. `is_parent_member()` is not the fix either —
   it returns true for any approved `parent_accounts` row regardless of
   `profiles.role`. The new check requires both halves explicitly.
2. **`birth_year` is required on a client profile INSERT.** 030 derives
   `consent_status` from `birth_year`, and
   `consent_required_for_birth_year(null)` is FALSE — so a profile INSERT
   that simply OMITTED the field landed `not_required`, `account_active()`
   returned true, and **the entire under-13 gate was skipped by leaving a
   field out.** Verified on staging before writing the fix: the column is
   nullable, its CHECK permits NULL, and the trigger's INSERT branch accepted
   a row without it.

**Apply:** `supabase/migrations/033_parent_notes_and_required_birth_year.sql`

**Pre-flight:** none required. It constrains NEW client inserts only —
existing rows with a NULL `birth_year` predate the column and are
deliberately grandfathered (a NOT NULL would mean inventing a birth year).

**Verify:** (a) as an approved PLAYER member, inserting an
`encouragement_notes` row must be refused; (b) as an approved PARENT, it must
still succeed; (c) a client profile INSERT with no `birth_year` must raise
`23502`; (d) an under-13 birth year must still land `pending`. All four
attack-tested on staging 2026-11-15.

**Rollback:**
```sql
-- 1. restore the permissive note policy
drop policy if exists "encouragement_notes_insert_parent" on public.encouragement_notes;
create policy "encouragement_notes_insert_parent"
on public.encouragement_notes for insert to authenticated
with check (parent_id = (select auth.uid()) and public.is_family_member(family_code));
-- 2. restore the pre-033 trigger body. This used to say "restore 032's
--    version verbatim", which is not something anyone can paste at 3am —
--    the same mistake this plan's other rollbacks were fixed for. Note it
--    restores the 035 form (the `profile_row_exists` guard), NOT 032's
--    literal text: 032's version breaks every profile upsert in the app.
create or replace function public.protect_privileged_profile_columns()
returns trigger language plpgsql security invoker set search_path = public
as $fn$
declare v_is_new_account boolean;
begin
  if current_user in ('service_role','postgres','supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    v_is_new_account := not public.profile_row_exists(new.id);
    if v_is_new_account and new.family_code is not null
       and public.family_code_is_taken(new.family_code) then
      raise exception 'Use the join code to request access to an existing family; it cannot be set on a profile directly.'
        using errcode='42501';
    end if;
    new.subscription_tier := 'free'; new.whop_membership_id := null;
    new.stripe_customer_id := null; new.stripe_subscription_id := null;
    if v_is_new_account then
      new.consent_status := case when public.consent_required_for_birth_year(new.birth_year)
                                 then 'pending' else 'not_required' end;
      new.consent_granted_at := null; new.consent_granted_by := null;
    else
      select p.consent_status, p.consent_granted_at, p.consent_granted_by
        into new.consent_status, new.consent_granted_at, new.consent_granted_by
        from public.profiles p where p.id = new.id;
    end if;
    return new;
  end if;
  if new.subscription_tier is distinct from old.subscription_tier
  or new.whop_membership_id is distinct from old.whop_membership_id
  or new.stripe_customer_id is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.role is distinct from old.role
  or new.family_code is distinct from old.family_code
  then raise exception 'This profile field can only be changed by Seeded.' using errcode='42501'; end if;
  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.' using errcode='42501'; end if;
  if old.birth_year is null and new.birth_year is not null then
    new.consent_status := case when public.consent_required_for_birth_year(new.birth_year)
                               then 'pending' else 'not_required' end;
    new.consent_granted_at := null; new.consent_granted_by := null;
  else
    new.consent_status := old.consent_status;
    new.consent_granted_at := old.consent_granted_at;
    new.consent_granted_by := old.consent_granted_by;
  end if;
  return new;
end; $fn$;
revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;
```
⚠️ **Risk: this step is NOT "strictly a tightening", which is what this
line used to claim.** As written, 033 broke every profile write in the app:
`writeCurrentPlayerProfile()` saves with `.upsert()`, Postgres fires BEFORE
INSERT triggers for the whole statement before it detects the conflict, and
the payload has no `birth_year` because the `Player` type has no such field.
Renaming yourself in Settings failed with "A birth year is required to
create an account." The same mechanism broke 032 for anyone already in a
family. **Both are fixed by step 12 (035), which must be applied in the same
window — do not ship 032 or 033 without it.**

"Every client signup path already sends `birth_year`" is true and was
irrelevant: the break was on update-shaped upserts, which can never send it.

The service role is exempt via the trigger's first branch, so the Whop
webhook and support tooling are unaffected.

### Step 11 — migration 034 (rate limits enforced in the database)

**What:** moves rate-limit ENFORCEMENT from our API routes into the tables
themselves.

**The gap it closes.** 028 put the counter in Postgres so it would survive
multiple serverless instances — correct, and still only half the job. The
limit was *consumed* by `lib/rate-limit.ts`, i.e. by our own routes. But
`authenticated` holds table-level INSERT/UPDATE/DELETE, so a client with the
same bearer token can POST straight to `/rest/v1/utr_entries` and never touch
a route. **Every limit was advisory.** 024's comment already conceded this
for `profiles`; it was true of every table.

**Apply:** `supabase/migrations/034_enforce_rate_limits_in_database.sql`

A BEFORE INSERT OR UPDATE OR DELETE trigger (`zz_rate_limit_<table>`) on 20
tables, plus `rate_limit_for_bucket()` (the policy, in one place) and
`peek_rate_limit()` (the same answer, spending nothing). The routes now PEEK
rather than consume — if both counted, every API write would count twice and
halve the real limit. The `zz_` prefix matters: triggers fire in name order
and this must run AFTER the column-protection trigger on `profiles`, so a
write that is going to be rejected as a privilege violation does not also
spend the caller's budget.

**Verify:** as a test user (NOT as `postgres`), 20 direct `utr_entries`
inserts succeed and the 21st raises `53400`; a second user is unaffected at
the first's ceiling; the service role is never limited. Attack-tested on
staging 2026-11-15.

⚠️ **The trap this hit, recorded so it is not repeated.** The first version
exempted the service role with `current_user in ('postgres', 'service_role')`.
The function is SECURITY DEFINER — it must be, to write `rate_limit_events`,
which `authenticated` deliberately cannot touch — and **SECURITY DEFINER sets
`current_user` to the function OWNER**. So the exemption matched every caller
and the trigger silently limited nobody: all 25 attack writes succeeded. It
now reads the JWT role claim instead. This is the mirror image of 032's trap,
where an inline `exists(...)` in a SECURITY INVOKER trigger was filtered by
RLS. Same lesson from the other side: know which user a function thinks it
is, and never trust a guard you have not watched fail.

**Rollback:**
```sql
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','utr_entries','matches','coach_outreach','season_budgets',
    'budget_expenses','training_plans','workout_sessions','exercises',
    'session_exercises','saved_templates','daily_checkins',
    'tournament_entries','cost_calculations','recruiting_checklist_items',
    'user_settings','families','family_codes','encouragement_notes',
    'parent_reports'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'zz_rate_limit_' || t, t);
  end loop;
end $$;
drop function if exists public.enforce_write_rate_limit();
drop function if exists public.peek_rate_limit(text);
drop function if exists public.rate_limit_for_bucket(text);
```
⚠️ **Rolling 034 back requires rolling the code back too, or reverting
`lib/rate-limit.ts` to call `consume_rate_limit`** — that file now calls
`peek_rate_limit`, which this rollback drops, and it FAILS CLOSED. Dropping
the function without the code change turns every rate-limited write into a
429. 028's `consume_rate_limit` is untouched by 034 and still exists, so the
revert is a one-line change back.

**Risk: medium.** It is the only step that can refuse an ordinary user's
write. The limits are generous (20/hour for UTR entries, 60/hour for
profiles, 120/hour for training) and are per-user per-hour, but this is the
step to watch after deploying.

### Step 12 — migration 035 (fixes two Criticals that 032/033/034 introduced)

**This step is not optional and cannot be deferred.** Without it, 032 and
033 break every profile write in the app and 034 breaks account deletion for
every user. All three were found by an independent review on 2026-11-15 and
reproduced against staging before this migration was written.

**What it fixes:**

1. **Profile writes.** `writeCurrentPlayerProfile()` saves with supabase-js
   `.upsert()`, which compiles to `INSERT ... ON CONFLICT DO UPDATE`.
   PostgreSQL fires BEFORE INSERT row triggers for the whole statement
   *before* it detects the conflict, so the INSERT branch of
   `protect_privileged_profile_columns()` runs on ordinary profile UPDATES —
   where `birth_year` is absent (the `Player` type has no such field) and
   `family_code` is the user's own. Reproduced on staging:
   `ERROR 23502: A birth year is required to create an account.` and
   `ERROR 42501: Use the join code to request access ...`, for a user
   renaming themselves. 035 gates both checks on `profile_row_exists()`, a
   SECURITY DEFINER helper, so they apply only to a genuine account
   creation.
2. **Account deletion — all of P0-8.** `delete_my_account()` is SECURITY
   DEFINER but reads `auth.uid()`, and the caller's JWT role is
   `authenticated`, so 034's service-role exemption never applied. The
   predicted failure was a rate-limit `53400` after 20 cascaded rows; the
   actual failure, reproduced on staging, is worse and hits **every** user:
   as the cascade removes `auth.users`, the trigger tries to log a
   rate-limit event for a user that no longer exists —
   `ERROR 23503: ... violates foreign key constraint
   "rate_limit_events_user_id_fkey"`. 035 adds a transaction-scoped
   `seeded.bypass_rate_limit` marker that only `delete_my_account()` sets.
   A client cannot set a GUC through PostgREST.
3. **The training bucket was below one ordinary save.** The calendar
   re-upserts every plan row on each save (~48 rows) against a shared limit
   of 120, and `/events` swallows the error — so edits would appear to apply
   and never be written. Raised to 2000.
4. **`consume_rate_limit` now reads `rate_limit_for_bucket()`**, which 034's
   own comment incorrectly claimed it already did.

**Apply:** `supabase/migrations/035_fix_upsert_writes_and_deletion.sql`

**Verify (all seven were run on staging):**
- an `.upsert()` on an EXISTING profile with no `birth_year` **succeeds**
- an in-family user's upsert carrying their own `family_code` **succeeds**
- a genuinely new profile claiming a taken `family_code` still raises `42501`
- a genuinely new profile with no `birth_year` still raises `23502`
- a new under-13 profile still lands `consent_status = 'pending'` and has its
  tier scrubbed to `free`
- `delete_my_account()` succeeds for a user with 50 cascaded `utr_entries`
  and removes the profile, the entries and the auth user
- the limiter still enforces: exactly 20 direct `utr_entries` writes, 21st
  refused

**Rollback:**
```sql
-- 1. LEAVE public.profile_row_exists() IN PLACE. Do not drop it.
--
--    An earlier version of this rollback dropped it. Step 10's rollback
--    creates a trigger body that CALLS it, so running the two in the
--    documented reverse order (12, then 10) left every profile write in the
--    app raising `42883 function public.profile_row_exists(uuid) does not
--    exist` — a second outage, caused by the rollback. Reproduced on staging
--    2026-11-15 with exactly the upsert writeCurrentPlayerProfile() issues.
--    The function is a SECURITY DEFINER one-liner answering "does this
--    profile row exist", granted only to `authenticated`; leaving it is
--    additive and inert, like the other 16 functions a full rollback leaves
--    behind (see "These rollbacks restore BEHAVIOUR, not SCHEMA" above).
--
-- 2. Re-run these three migration files, in this order, to restore the
--    function bodies 035 replaced. Every statement in all three is
--    `create or replace` / `if exists` / `if not exists`, so re-running them
--    is safe and was verified on staging 2026-11-15:
--
--      supabase/migrations/028_api_rate_limits.sql
--          -> consume_rate_limit()        (035 rewrote it to read
--                                          rate_limit_for_bucket())
--      supabase/migrations/029_real_account_deletion.sql
--          -> delete_my_account()         (035 added the rate-limit bypass)
--      supabase/migrations/034_enforce_rate_limits_in_database.sql
--          -> enforce_write_rate_limit(), rate_limit_for_bucket()
--
--    Naming the files rather than pasting the bodies is deliberate: a
--    hand-copied function body in this document is a body that drifts from
--    the migration it claims to be.
```
**Rolling this back restores two behaviours that are known to be broken** —
034's cascade deletion fails with `23503` for every user, and 032/033's
INSERT branch fails ordinary profile upserts. It exists only as a step on the
way to rolling back 13→8 together, never as a resting state. If you have
rolled back this far, keep going.
**Risk: low to apply, and it only loosens checks that were never meant to
fire.** The security properties of 032, 033 and 034 are all preserved and
were re-tested after the fix.

### Step 13 — migration 036 (the joined-member read gap, and the write half nobody had noticed)

**This step is not optional either, and it is the only one that changes what
one user may read about another.** Apply it with the rest; the code on `v1`
depends on it.

Niran's decision, 2026-11-15: a player who joins with the code and is
approved has opted in, so approved members of that family may read that
player's data, exactly as in the player-first flow. Nobody outside the
family, no pending members.

**What it fixes.** Membership has two storage shapes — the creator's
`profiles.family_code`, and every joiner's `parent_accounts` row, whose
`profiles.family_code` is deliberately NULL because writing it is the
takeover hole 022/032 closed. `my_family_code()` (026) answers across both;
almost nothing else did.

1. **Reads.** `family_members_read` was `(family_code IS NOT NULL) AND
   is_family_member(family_code)` and `utr_entries_select_family` keyed off
   `profiles owner.family_code` the same way. A joiner's is NULL, so neither
   could ever match. Reproduced on staging before the migration: the
   creator-parent of `FAKEFAMILY01` saw **1 profile (their own) and 0 of the
   joined player's 3 `utr_entries` rows**, while `my_family_code()` returned
   `FAKEFAMILY01`. 036 replaces seven read policies with
   `shares_approved_family_with(uuid)`.
2. **Writes.** Nine tables carry their own `family_code`, stamped by the app
   from `profiles.family_code`. For a joiner that was NULL, so their
   matches and tournaments were unreadable by their own family, and **a
   joined PARENT could not write at all** — `encouragement_notes` /
   `season_budgets` / `budget_expenses` all WITH CHECK on the row's
   family_code. Reproduced on staging with the trigger disabled:
   `42501 new row violates row-level security policy for table
   "encouragement_notes"`. 036 stamps the column from `my_family_code()` in
   a BEFORE INSERT/UPDATE trigger. That also closes a hole already open:
   those tables' INSERT policies check only `user_id = auth.uid()` and never
   the family_code, so a client could publish its own data into a stranger's
   family page.

`docs/TODO.md` recorded (2) as "matches, coach_outreach and
tournament_entries ... do not have this problem." That was wrong — true in
the player-first flow, false in the parent-first one, which is the ordinary
one.

**Pre-flight.** Nothing to check: 036 only replaces policies and adds a
trigger, and it neither reads nor writes any existing row. Confirm the
functions it depends on are present first, which they are after steps 3 and
8:
```sql
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('my_family_code','is_family_member');
-- expect both
```

**Verify — as a test user, NOT as postgres.** `postgres` bypasses RLS;
`set_config('request.jwt.claims', ...)` sets `auth.uid()` but leaves you a
superuser, so every count comes back complete and looks like a pass. Use
`set local role authenticated` as well:
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<the creator-parent>","role":"authenticated"}';
select count(*) from public.profiles;                               -- 2, not 1
select count(*) from public.utr_entries where user_id='<the joiner>'; -- > 0
rollback;
```
Then repeat as a stranger, as a PENDING member, and as a member of another
family: each must see **1 profile (their own) and 0 rows** of the joiner's.
Then `remove_family_member('<the joiner>')` and re-check the parent: back to
1 and 0, immediately. All five were run on staging on 2026-11-15.

**Rollback:**
```sql
-- 1. Restore 023 §8 / 027's read policies.
drop policy if exists "family_members_read" on public.profiles;
create policy "family_members_read" on public.profiles
  for select to authenticated
  using (family_code is not null and public.is_family_member(family_code));

drop policy if exists "utr_entries_select_family" on public.utr_entries;
create policy "utr_entries_select_family" on public.utr_entries
  for select to authenticated
  using (exists (
    select 1 from public.profiles owner
    where owner.id = utr_entries.user_id
      and owner.family_code is not null
      and public.is_family_member(owner.family_code)));

-- 2. Restore the five row-stamped read policies.
do $$
declare t text;
begin
  foreach t in array array['matches','tournament_entries','coach_outreach',
                           'daily_checkins','cost_calculations'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using ((user_id = (select auth.uid())) or public.is_family_member(family_code))
    $f$, t||'_read', t);
  end loop;
end $$;

-- 3. Drop the stamp. Rows written while 036 was live keep the family_code it
--    gave them, which is the CORRECT value in both shapes — nothing to undo.
do $$
declare t text;
begin
  foreach t in array array['matches','coach_outreach','tournament_entries',
                           'daily_checkins','cost_calculations',
                           'encouragement_notes','season_budgets',
                           'budget_expenses','parent_reports'] loop
    execute format('drop trigger if exists stamp_family_code on public.%I', t);
  end loop;
end $$;
drop function if exists public.stamp_family_code();

-- 4. The predicate last: dropping it before the policies that call it fails.
drop function if exists public.shares_approved_family_with(uuid);
```
**Order matters.** `drop function ... shares_approved_family_with` while any
of the seven policies still references it raises `2BP01` (dependent objects).
Steps 1 and 2 must come first. This is the same class of defect the 2026-11-15
rehearsal found four times in the rollback half of this plan.

**Risk: medium.** It is the only step that widens cross-user visibility, and
the data is minors'. It was attack-tested in both directions before being
written up. If you roll the code back but leave 036 applied, nothing breaks —
the old code simply never asks for the wider rows.

### Step 14 — migration 037 (removal now revokes; the family read stops being the whole row)

**036 does not ship without this.** An independent review found three defects
in 036 within an hour of it being written, two of which made a sentence 036
itself shipped in `/privacy` untrue. All three are fixed here.

**1. Removal did not revoke, and this is production's actual data shape.**
036 argued against setting a joiner's `profiles.family_code` because
`remove_family_member()` only deletes the `parent_accounts` row — then shipped
copy saying "the moment a member is removed from a family they can no longer
see anything about anyone in it." Checked read-only on production: **all three
`parent_accounts` rows belong to users whose own `profiles.family_code` is the
same code** (the pre-023 shape, when the app wrote both). Reproduced on
staging — after removal the member still read 2 profiles and 3 `utr_entries`
rows, `my_family_code()` still resolved, and `family_members()` still listed
them as an approved creator. 037 clears the profile column on removal, but
only when somebody else still holds that code, and **it refuses to remove the
family's account holder at all.**

That second guard exists because the first version of this migration did not
have it, and it was worse than the bug it fixed: production's rows all carry
BOTH a link and the code, so the account holder DID have a removable link,
and clearing their `profiles.family_code` locked them out of their own family
on the say-so of any approved member. Reproduced on staging before it shipped
— as the joined player, `remove_family_member(<the holder>)` returned
`removed` and left the holder with `family_code = NULL`. The holder is
`family_codes.player_id` where that row exists (2 of production's 6 families)
and otherwise the earliest-created profile carrying the code; the refusal
reuses the "That person cannot be removed." message so it is not an oracle
for who holds the family. 026 claimed the account holder was not evictable;
until now that was true only because the delete hit zero rows for someone
with no link.

Both production families satisfy the other-holders guard: `NIRAN-0FI8` has 4
profiles holding the code to 2 links, `NIRAN-0LK2` has 2 to 1.

**2. The family read was the whole row.** RLS cannot narrow COLUMNS, and
`authenticated` holds column-level SELECT on every `profiles` column — so any
policy letting one member read another's row exposed email, gpa, birth_year,
`whop_membership_id`, both stripe ids, `utr_profile_link`, `privacy_level`,
`username` and `home_area`. 027's own text calls that row shape the hole it
closed; it closed it for strangers and left it inside the family, and 036
widened the family case from one flow to both. Live on production today:
family `NIRAN-0FI8` has **four** profiles holding the same code, so four
accounts can read each other's complete rows. 037 drops
`family_members_read` and moves the roster into `family_members()`, which now
returns an enumerated 15-column list. **Net effect is narrower than before
036 and narrower than before this whole piece of work.**

**3. Rows written while PENDING were invisible to the family in the app.**
036 fixed the policy and left the data layer filtering on the row's stamped
`family_code`. A row a joiner writes before approval is stamped NULL, and the
trigger freezes the column on UPDATE, so re-saving cannot heal it: RLS allowed
those rows and the app never asked for them. Fixed in the code, not here —
five call sites now filter `.in("user_id", approvedFamilyMemberIds())`.

**Pre-flight.** None. 037 replaces two functions and drops one policy; it
reads and writes no existing row.

**Verify — as a test user, NOT as postgres:**
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<an approved parent>","role":"authenticated"}';
select count(*) from public.profiles;            -- 1, and only 1: their own row
select count(*) from public.family_members();    -- 2+, the roster
select count(*) from public.utr_entries
 where user_id = '<the joined player>';          -- > 0, history still readable
rollback;
```
Then, in the legacy double-linked shape, `remove_family_member('<id>')` must
return `{"status":"removed","family_code_cleared":true}`, after which the
removed member reads 1 profile (their own), 0 `utr_entries`, 0
`family_members()` rows, 0 families, and `my_family_code()` is NULL. All of
that was run on staging on 2026-11-15.

**Rollback:**
```sql
-- 1. Restore 036's cross-user read policy. NOTE: this reopens the whole-row
--    read described above. Prefer rolling 036 back too (step 13).
drop policy if exists "family_members_read" on public.profiles;
create policy "family_members_read" on public.profiles
  for select to authenticated
  using (public.shares_approved_family_with(profiles.id));

-- 2. Restore 031's nine-column family_members(). DROP first — a return type
--    cannot change under CREATE OR REPLACE (42P13) — and follow with the
--    revoke/grant pair, because a fresh CREATE re-grants EXECUTE to PUBLIC.
drop function if exists public.family_members();
create function public.family_members()
returns table (user_id uuid, name text, email text, role text, status text,
               is_creator boolean, joined_at timestamptz, reminded_at timestamptz,
               consent_status text)
language sql security definer set search_path = public stable
as $fn$
  with fam as (select public.my_family_code() as code)
  select p.id, coalesce(nullif(p.name,''),'Family member'), p.email,
         coalesce(p.role,'player'), 'approved'::text, true,
         p.created_at, null::timestamptz, p.consent_status
  from public.profiles p, fam
  where fam.code is not null and p.family_code = fam.code
    and public.is_family_member(fam.code)
  union all
  select pa.user_id, coalesce(nullif(p2.name,''),'Family member'), p2.email,
         coalesce(p2.role,'parent'), pa.status, false,
         pa.created_at, pa.reminded_at, p2.consent_status
  from public.parent_accounts pa
  join public.profiles p2 on p2.id = pa.user_id, fam
  where fam.code is not null and pa.family_code = fam.code
    and public.is_family_member(fam.code)
  order by 6 desc, 5, 7
$fn$;
revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;

-- 3. Restore 026's remove_family_member(), which does not clear the profile
--    column. This re-breaks the /privacy removal sentence; roll the copy
--    back with it or leave 037 applied.
-- 4. Drop 037's own helper. Nothing else uses it, it is granted to nobody,
--    and leaving it behind is schema drift the fingerprint will flag.
--    (Rehearsal 3 defect 5 — this line was missing.)
drop function if exists public.family_account_holder(text);

create or replace function public.remove_family_member(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare v_code text; v_deleted int;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='28000'; end if;
  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
    raise exception 'You are not in a family.' using errcode='22023'; end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself.' using errcode='22023'; end if;
  delete from public.parent_accounts where user_id = p_user_id and family_code = v_code;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'That person cannot be removed.' using errcode='22023'; end if;
  return jsonb_build_object('status','removed');
end; $fn$;
revoke all on function public.remove_family_member(uuid) from public, anon;
grant execute on function public.remove_family_member(uuid) to authenticated;
```
**Risk: low to apply, and it only narrows.** Rolling it back is the risky
direction, because it widens a read of minors' data and re-breaks a sentence
in `/privacy`.

### A thing to know about 036's stamp trigger, found by the same review

`families` has `ON DELETE SET NULL` onto `matches`, `daily_checkins` and
`cost_calculations`. Deleting a family therefore fires an **UPDATE** on those
three tables, and 036's `stamp_family_code` trigger does
`new.family_code := old.family_code` on UPDATE — which would revert the
referential action and break `delete_my_account()`. It does not, because a
referential action runs as the table owner, so `current_user` is `postgres`
and hits the trigger's exemption. **That exemption is load-bearing for
account deletion and nothing in the migration said so.** Verified: the sole
creator of a family holding stamped rows in all three tables deleted cleanly
(`{"status":"deleted","family_deleted":true}`).

### Step 14b — migration 038 (one roster row per member)
**Ships with 036 + 037. Do not apply those without this.** Found by the third
dress rehearsal — the first one seeded in **production's actual data shape**
rather than a convenient creator/joiner split. Two earlier rehearsals could
not have found it, and the seed is the whole reason.

**What it fixes.** `family_members()` was a `UNION ALL` of the two membership
shapes. The repo describes those as alternatives; on production they are not —
**all three `parent_accounts` rows belong to users whose own
`profiles.family_code` is the same code** (the pre-023 era, when the app wrote
both). 037 already had to special-case that in `remove_family_member()`. At the
roster it meant:
- **everyone holding both shapes came back twice.** Measured on the rehearsal
  database: **9 rows for 6 distinct people.** `FamilyMembersCard` keys the list
  by `userId`, so that is a React key collision — a console error, and one of
  each pair dropped.
- **"account holder" was wrong for three people, and their Remove button was
  hidden.** The card reads `is_creator`, which was hardcoded `true` for the
  whole `profiles` branch. Its own comment called that "a real fact now"; in
  production's shape four people "belong via their own profile".

**Apply:** `supabase/migrations/038_one_roster_row_per_member.sql`

**Pre-flight:** none. It only rewrites one SECURITY DEFINER function; no
policies, columns or grants change.

**Verify (as a real member, NOT as `postgres`):**
```sql
select count(*), count(distinct user_id) from public.family_members();
-- equal, and equal to the number of people in the family
select count(*) from public.family_members() where is_creator;   -- exactly 1
```
Measured after applying: **5 rows for 5 people, exactly one `is_creator`, and
it is the id `family_account_holder()` returns.** Pending join requests still
appear (a pending row now wins over an approved twin, so a request can never be
hidden by a stale profile column).

`is_creator` now means `user_id = family_account_holder(code)` — the same
predicate `remove_family_member()` refuses on — so the hidden Remove button and
the server's refusal cannot disagree. `lib/db/family-roster-shape.test.ts`
fails the build if the `UNION ALL` or the hardcoded flag comes back; it is
mutation-tested (a probe migration reintroducing the old shape fails two of its
four tests).

**Rollback:** written out, because "re-run 037's body" is not pasteable. 037's
text is a bare `create function` preceded by a `drop function`, so an operator
would have to locate the block, delete the drop AND change `create` to
`create or replace`; pasted as-is it raises `42723`. That is the defect class
this plan already fixed twice (steps 9 and 12) and it is not being
reintroduced in the newest step.

```sql
create or replace function public.family_members()
returns table (user_id uuid, name text, email text, role text, status text,
               is_creator boolean, joined_at timestamptz, reminded_at timestamptz,
               consent_status text, current_utr numeric, grade integer,
               graduation_year integer, onboarded boolean,
               target_school_slugs text[], gender text)
language sql security definer set search_path = public stable
as $fn$
  with fam as (select public.my_family_code() as code)
  select p.id, coalesce(nullif(p.name,''),'Family member'), p.email,
         coalesce(p.role,'player'), 'approved'::text, true,
         p.created_at, null::timestamptz, p.consent_status,
         p.current_utr, p.grade, p.graduation_year, p.onboarded,
         p.target_school_slugs, p.gender
  from public.profiles p, fam
  where fam.code is not null and p.family_code = fam.code
    and public.is_family_member(fam.code)
  union all
  select pa.user_id, coalesce(nullif(p2.name,''),'Family member'), p2.email,
         coalesce(p2.role,'parent'), pa.status, false,
         pa.created_at, pa.reminded_at, p2.consent_status,
         p2.current_utr, p2.grade, p2.graduation_year, p2.onboarded,
         p2.target_school_slugs, p2.gender
  from public.parent_accounts pa
  join public.profiles p2 on p2.id = pa.user_id, fam
  where fam.code is not null and pa.family_code = fam.code
    and public.is_family_member(fam.code)
  order by 6 desc, 5, 7
$fn$;
revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;
```
That restores the duplicate rows and the wrong "account holder" label; nothing
else depends on this function's shape.

### Step 14c — migration 039 (removal for profile-only members; `parent_reports` stops being client-writable)
**Ships with 036 + 037 + 038. Not optional, and not droppable** — Niran
confirmed on 2026-11-15 that 039 ships. There is no "launch at seventeen"
path; an earlier draft of the go sequence carried one and it has been
deleted.

**Rehearsed in position, not bolted on.** 039 was written after the third
rehearsal had already run, so the obvious question is whether it was ever
exercised in sequence from production's 23-migration shape. It was. Staging's
migration ledger records the whole run in ascending order with nothing after
it:

```
r3_step01_025 … r3_step13_036 → r3_step14_037 → r3_step14b_038 → r3_step14c_039
```

Re-measured against that end state on 2026-11-15, as a real `authenticated`
member rather than as `postgres`: an approved member reads **1** `profiles`
row, the roster returns **7 rows / 7 distinct / exactly 1 holder**, a
profile-only member removes cleanly
(`{"status":"removed","link_removed":false,"family_code_cleared":true}`), the
account holder is still refused `22023`, and `parent_reports` INSERT is
refused **42501 as an approved parent AND as a sibling player** while the
family can still read the table. Every mutating probe ran inside a
transaction that was rolled back, so staging is unchanged.

Both halves were found by the independent verification pass that followed the
third rehearsal, and both were measured against **production's real data,
read-only**.

**1. A member with no `parent_accounts` row could never be removed.**
`remove_family_member()` deletes from `parent_accounts` and raises when
`row_count = 0`; for a member who holds only `profiles.family_code` that is
every time. 038 then correctly reports `is_creator = false` for them, so
`/family` renders a Remove button that errors on every click while the member
keeps full read access for ever. Production, per family — profiles on the code
/ also linked / profile-only:

| code | on code | linked | profile-only |
|---|---|---|---|
| `JORDA-0N6T` | 1 | 0 | 1 |
| `NIRAN-0FI8` | 4 | 2 | 2 |
| `NIRAN-0LK2` | 2 | 1 | 1 |
| `SIDHA-0FBP` | 1 | 0 | 1 |

Most of those profile-only rows **are** the account holder, correctly
unremovable. **Exactly one is not:** a `player` in `NIRAN-0FI8`, not the
holder, no link row — unremovable by anyone including the holder. Reproduced
on staging in that shape, then fixed and re-tested.

**2. `parent_reports` was client-writable.** The policy is named
`parent_reports_service_insert` and is granted to **`authenticated`** with
`with check (is_family_member(family_code))`. Verified on staging: an approved
PARENT *and* an approved SIBLING PLAYER both inserted a report row with an
arbitrary `title` and `public_url`, which `loadParentReports()` renders to the
whole family. A policy whose name asserts a rule its body does not implement —
the same shape as the `encouragement_notes_insert_parent` bug 033 fixed. It is
live on production and it made CLAUDE.md's "parents can write exactly two
things… enforced at the RLS layer" and the same sentence in `/privacy` false.

**Apply:** `supabase/migrations/039_removal_for_profile_only_members_and_parent_reports.sql`

**Pre-flight:** none. No columns, no grants; one function body and one dropped
policy. Worth running the shape query above on production first so you know
which member becomes removable.

**Verify (as real members, NOT as `postgres`):**
```sql
select public.remove_family_member('<a profile-only member>');
--   -> {"status":"removed","family_code_cleared":true,"link_removed":false}
select public.remove_family_member('<the account holder>');   -- -> 22023
select public.remove_family_member('<a stranger>');           -- -> 22023
insert into public.parent_reports (...);  -- -> 42501, as parent AND as player
select count(*) from public.parent_reports;  -- unchanged: the READ still works
```
Measured after applying: all five as above, and the removed member then read
1 profile (their own), 0 matches, 0 roster rows, `my_family_code() -> NULL`.

**Rollback:** in the migration's own trailer, written out as runnable SQL.
Note it restores the unremovable member AND the client write, so roll the
`/privacy` copy back with it or leave 039 applied.

### Step 14d — migration 040 (the Free target cap blocks only growth)
**Added 2026-11-16, during the production run, after 024 was already live.**
Step 4's pre-check found **2** real Free players with 5 target schools each.
§J step 4 said the trigger "only blocks growth"; it did not. On UPDATE it
passed only a SHRINKING list (`<`, not `<=`), and the app's
`writeCurrentPlayerProfile()` upserts the whole profile with
`target_school_slugs` every time — so every save those two made would have
been refused (23514), and so would removing one school, because an upsert's
INSERT half has no OLD to compare with (the same trap as 035). Measured on
production in rolled-back transactions, then reproduced on staging.
**Apply:** `040_free_target_limit_blocks_only_growth.sql`, after 039 (it
calls `profile_row_exists()` from 035).
**Verify (as an over-limit Free player, `set local role authenticated`):**
same-size upsert ok, rename ok, prune 5 → 4 ok; grow to 6, re-grow 4 → 5,
and a Free player at 3 adding a 4th all 23514; a Player-tier save of 8 ok.
Staging, before → after: `upsert_same5 23514 → ok`, `upsert_prune4 23514 → ok`,
everything else unchanged. `lib/db/free-target-limit.test.ts` fails the
build if the strict version returns.
**Rollback:** re-run the `create or replace function
public.enforce_free_tier_target_limit()` block from 024 verbatim (grants
are kept by `create or replace`). The trigger itself is not touched.
**Risk: low** — one function body; strictly more permissive than 024 only
for saves that do not add schools.

### Step 15 — the code (`v1` → `main`)
Only after steps 1–14d are applied and verified.
**`git revert d059006` DOES NOT WORK, and the obvious merge leaves
production on the 503.** This step said to revert that commit in the PR. It
cannot be reverted from `v1`: **`d059006` is not an ancestor of `v1`** and
`middleware.ts` has never existed there, so there is nothing for the inverse
patch to delete. Worse, the plain merge is clean and *keeps* the file —
verified on 2026-11-15 by dry-running the real merge in a throwaway worktree:
`middleware.ts` survives, so Vercel would report READY and seededtennis.com
would still answer 503. A silent failure at the last step of the rollout.

CLAUDE.md's "`v1` already contains every commit on `main`" was true when it
was written and stopped being true the moment the maintenance commit landed.

**Steps 1–3 below are DONE on `v1`** — they are ordinary git commits, they
needed no sign-off, and doing them early is what lets a preview build prove
the site renders without the file. Nothing in them touches production.

1. ~~On `v1`: `git merge origin/main`~~ — **done**, commit `0cea97e`. Clean;
   it brings `middleware.ts` in.
2. ~~`git rm middleware.ts && git commit`~~ — **done**, the commit directly
   after `0cea97e`. The removal is now an explicit change on `v1`'s side,
   which is what makes the merge drop it.
3. ~~Confirm before opening anything~~ — **done**: merged `v1` into a
   detached `origin/main` in a scratch worktree; `test -f middleware.ts` is
   false and the merge is clean. Re-run that dry-run if anything else lands
   on `main` first.
4. Push `v1`. Open the PR from `v1` to `main`. CI (`verify`) must be green —
   it runs typecheck, lint, the full suite and a production build.
5. Merge. Vercel auto-deploys `main` to seededtennis.com. **Confirm the site
   returns 200 and not 503 before calling the deploy done.** This is the
   check that would have caught the silent failure above, so do not skip it
   because the Vercel dashboard says READY.
6. Smoke-test on production immediately: sign in; load `/today`, `/plan`, `/schools`, `/outreach`; mark a coach "emailed" (this is the P0-5 write that is broken today — it must now succeed); save a target school; as a Family account, open the parent view and edit the season budget.
**Rollback:** Vercel → Deployments → the previous production deployment →
"Promote to Production". Instant, code-only. The database changes do NOT
roll back with it. Of steps 1–14, all are backwards-compatible with the old
code **except two**, so if you roll the code back:
- run 024's rollback SQL (the old code writes outreach at Family tier), and
- leave 028 in place (the old code does not call the limiter at all).
027, 029, 030, 031, 032 and 033 are safe to leave applied under the old code:
it never reads another user's profile, never calls `delete_my_account()`, has
no account that is `pending` consent, and never inserts a profile carrying a
taken family code. **034 is the exception** — see its own rollback note: the
old code calls `consume_rate_limit`, which 034 leaves in place, so leaving
034 applied is safe, but dropping it while the NEW code is live 429s every
write.

### PR B — Steps 16–19 (migrations 041–044), written 2026-11-18

**Not applied to production.** Applied to STAGING (`gnlcpnsweqbtwpaqhqqg`)
only, probed as real `authenticated` users in rolled-back transactions, and
each rollback below was rehearsed on staging inside a transaction that was
then rolled back (all three, in reverse order: 043 → 042 → 041, with a
profile save and a join after each). Order on production: **041, 042, 043, 044** (044 added later the same day; Step 19),
after Step 15's code is live, then the PR B code. Personas:
`docs/STAGING_PERSONAS.md` (families `FAKEFAM-PB1`…`PB5`).

### Step 16 — migration 041 (diagnostic onboarding fields)
`profiles.birth_month smallint` (1–12; month + year only, never a day) and
`profiles.enrollment_term text` (`fall_after_grad` / `spring_after_grad` /
`not_sure`). `birth_month` is **write-once from the client** exactly like
`birth_year`: `protect_privileged_profile_columns()` is 035's body verbatim
plus one block. `enrollment_term` is ordinary.
**Apply:** `supabase/migrations/041_diagnostic_onboarding_fields.sql`.
**Pre-flight:** none (two nullable columns; no backfill).
**Verify (as a real user, `set local role authenticated` + claims) — staging, 2026-11-18, persona-b:**

| probe | result |
|---|---|
| `birth_month` null → 5 | ok |
| 5 → 5 (re-save, unchanged) | ok |
| 5 → 6 | **42501** "Date of birth can only be changed by Seeded." |
| 5 → null | **42501** |
| upsert carrying 7 when 5 is stored | **42501** |
| app-shaped full upsert without `birth_month` | ok |
| `enrollment_term` set / changed | ok / ok |
| `enrollment_term = 'winter'` | **23514** |
| update another user's `birth_month` | 0 rows (RLS) |
| `birth_month = 13` as postgres | **23514** |
| brand-new account INSERT with month + term | stored (3, `not_sure`) |
| 3 past-dated `utr_entries` inserts by the owner (onboarding) | ok; `utr_entry` bucket 3 of 20 used |

`utr_entries.recorded_at` is a **`date`** (no time, no zone) with no
past/future CHECK — only `utr between 1 and 16.5`. A date-only value must be
rendered as a calendar date, not parsed through `new Date('YYYY-MM-DD')`
(UTC midnight → the previous day west of UTC).
**Rollback (runnable; restores 035's trigger FIRST — 041's reads
`old.birth_month`, so dropping the column under it breaks every profile
UPDATE with 42703). If 043 is applied, run Step 18's rollback first.**
```sql
-- ROLLBACK 041 (onboarding fields). Run as postgres, AFTER 043's rollback
-- if 043 is applied. Function first: 041's trigger reads old.birth_month.
begin;
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_is_new_account boolean;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- An upsert's INSERT branch runs even when the row exists. Only a row
    -- that does NOT exist yet is an account being created.
    v_is_new_account := not public.profile_row_exists(new.id);

    if v_is_new_account then
      -- 032: a family_code may only be claimed if nobody holds it yet.
      if new.family_code is not null and public.family_code_is_taken(new.family_code) then
        raise exception
          'Use the join code to request access to an existing family; it cannot be set on a profile directly.'
          using errcode = '42501';
      end if;

      -- 033: the under-13 gate cannot be skipped by omitting the field.
      if new.birth_year is null then
        raise exception 'A birth year is required to create an account.'
          using errcode = '23502';
      end if;
    end if;

    -- Always scrubbed, new row or not: these are never the client's to set.
    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;

    if v_is_new_account then
      new.consent_status :=
        case when public.consent_required_for_birth_year(new.birth_year)
             then 'pending' else 'not_required' end;
      new.consent_granted_at := null;
      new.consent_granted_by := null;
    end if;
    -- NOTE: when the row already exists, the consent columns are left
    -- exactly as the payload had them and are NEVER read here.
    --
    -- An earlier draft did `select ... into new.consent_status ... from
    -- profiles where id = new.id`, which a verification pass flagged: this
    -- trigger is SECURITY INVOKER, so that read is RLS-filtered, and
    -- `SELECT INTO` with no rows sets its targets to NULL *silently* while
    -- consent_status is NOT NULL. Routing it through a SECURITY DEFINER
    -- helper then failed for a different reason — the trigger runs as
    -- `authenticated`, so the helper would have to be executable by every
    -- signed-in user, turning it into a consent-status oracle for any uuid.
    --
    -- Neither is necessary. For an upsert, `DO UPDATE SET` only assigns the
    -- columns in the payload, and consent_status is not one of them — so
    -- whatever this branch leaves in `excluded` never reaches the stored
    -- row. The BEFORE UPDATE branch below then forces consent from `old`,
    -- which is the authoritative value. For a plain INSERT onto an existing
    -- id, the statement fails with 23505 regardless.
    --
    -- The shortest correct code here is no code.

    return new;
  end if;

  if new.subscription_tier      is distinct from old.subscription_tier
  or new.whop_membership_id     is distinct from old.whop_membership_id
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.role                   is distinct from old.role
  or new.family_code            is distinct from old.family_code
  then
    raise exception 'This profile field can only be changed by Seeded.'
      using errcode = '42501';
  end if;

  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;

  if old.birth_year is null and new.birth_year is not null then
    new.consent_status :=
      case when public.consent_required_for_birth_year(new.birth_year)
           then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
  else
    new.consent_status     := old.consent_status;
    new.consent_granted_at := old.consent_granted_at;
    new.consent_granted_by := old.consent_granted_by;
  end if;

  return new;
end;
$fn$;
revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;

alter table public.profiles drop constraint if exists profiles_enrollment_term_check;
alter table public.profiles drop constraint if exists profiles_birth_month_check;
alter table public.profiles drop column if exists enrollment_term;
alter table public.profiles drop column if exists birth_month;
commit;
```
**Risk: low.** Additive columns; the trigger change only refuses changing a
month that is already set.

### Step 17 — migration 042 (the Family plan lock, B4)
**Owner decision, already made: lock it now.** A family is unlocked when ANY
member, in either membership shape, has `subscription_tier = 'family'`;
pending links never count. `family_has_tier(code, tier)` (SECURITY DEFINER;
answers `false` for a code the signed-in caller is not a member of, so it is
not an unrate-limited "does this code exist and pay" oracle),
`shares_family_plan_with(uuid)` (036's intersection, gated per shared code),
`my_family_has_tier(tier)` (the app's call).
Ten RESTRICTIVE policies named `family_plan_required` — a ceiling on top of
the existing permissive policies, which are untouched:

| table | command | condition |
|---|---|---|
| `utr_entries`, `matches`, `tournament_entries`, `daily_checkins`, `cost_calculations`, `coach_outreach` (every table whose SELECT uses `shares_approved_family_with`) | SELECT | `user_id = auth.uid() or shares_family_plan_with(user_id)` |
| `season_budgets`, `budget_expenses`, `parent_reports` | ALL | `family_has_tier(family_code,'family')` (USING and WITH CHECK) |
| `encouragement_notes` | ALL | USING `parent_id = auth.uid() or family_has_tier(...)`; CHECK `family_has_tier(...)` |

Not gated: `profiles` (own row only since 037), `families`,
`family_codes`, `parent_accounts`, `family_members()` (its five player-stat
COLUMNS are gated by 044, Step 19; its rows are not), and every
join/approve/deny/remove/consent RPC — a free family can still form.
API: `/api/family/budget` and `/api/family/budget/expenses` call
`refuseUnlessFamilyPlan()` (lib/api-auth.ts) → 403; `/api/account/export`
deliberately does not (right of access; RLS already scopes it, so a locked
family's export simply has no budget rows).
**Apply:** `supabase/migrations/042_family_plan_lock.sql`.
**Pre-flight (read-only, production) — how many families lose /family:**
```sql
select count(distinct code) filter (where not paid) as families_locking,
       count(distinct code) filter (where paid)     as families_staying_unlocked
from (
  select f.code, exists (
    select 1 from public.profiles p
    where (p.family_code = f.code
           or exists (select 1 from public.parent_accounts pa
                      where pa.user_id = p.id and pa.family_code = f.code and pa.status = 'approved'))
      and p.subscription_tier = 'family') as paid
  from public.families f
) s;
```
Every family in the first number loses cross-member reads and the budget the
moment 042 commits. That is the decision; know the number before you run it.
**Verify — staging, 2026-11-18, as real users:**

| identity | other members' UTR rows | budgets / expenses / notes | `my_family_has_tier('family')` | roster rows | budget expense insert | note insert |
|---|---|---|---|---|---|---|
| PB1 parent (free family) | **0** | 0 / 0 / 1 (their own note) | false | 3 | **42501** | **42501** |
| PB1 player (free) | 0 (own: 3) | 0 / 0 / 0 | false | 3 | — | — |
| PB2 parent (parent pays) | **3** | 1 / 2 / 1 | true | 2 | ok | ok |
| PB2 player (parent pays) | 0 (own: 3) | 1 / 3 / 2 | true | 2 | — | — |
| PB3 parent (player pays) | **3** | 1 / 2 / 1 | true | 2 | ok | ok |
| PB3 player (player pays) | 0 (own: 3) | 1 / 3 / 2 | true | 2 | — | — |
| PB5 solo player | 0 | 0 / 0 / 0 | false | 1 | — | — |
| A1 approved joiner (A1 holder pays) | 12 | 1 / 2 / 5 / reports 1 | true | 7 | — | — |

(Counts after the paid rows include the probe's own inserts — same
transaction.) Downgrade / re-upgrade, PB2:

| step | PB2 parent: other UTR / budgets / expenses / notes / tier |
|---|---|
| paid | 3 / 1 / 2 / 1 / true |
| payer set to `free` (as postgres) | **0 / 0 / 0 / 1 / false** (PB2 player: 0/0/0/0) |
| …row count as postgres | utr 3, budgets 1, expenses 2, notes 1 — **nothing deleted** |
| payer back to `family` | 3 / 1 / 2 / 1 / true |
| payer on `player` (not family) | 0 / 0 / 0 / 1 / false |

Also: PB5 asking `family_has_tier('FAKEFAM-PB3','family')` → **false** (not
its family); a PENDING joiner reads 0 and gets `false`; no public views and no
RLS-less tables exist (checked); `delete_my_account()` as a free parent still
works (`deleted`, their note gone, the family budget kept).
**Rollback (runnable; policies first — the functions cannot be dropped while a
policy uses them):**
```sql
-- ROLLBACK 042 (Family plan lock). Run as postgres. Policies first.
begin;
drop policy if exists family_plan_required on public.utr_entries;
drop policy if exists family_plan_required on public.matches;
drop policy if exists family_plan_required on public.tournament_entries;
drop policy if exists family_plan_required on public.daily_checkins;
drop policy if exists family_plan_required on public.cost_calculations;
drop policy if exists family_plan_required on public.coach_outreach;
drop policy if exists family_plan_required on public.season_budgets;
drop policy if exists family_plan_required on public.budget_expenses;
drop policy if exists family_plan_required on public.parent_reports;
drop policy if exists family_plan_required on public.encouragement_notes;
drop function if exists public.my_family_has_tier(text);
drop function if exists public.shares_family_plan_with(uuid);
drop function if exists public.family_has_tier(text, text);
commit;
```
Roll the PR B app code back first: without `my_family_has_tier()` the budget
routes fail closed (403) rather than open.
**Risk: medium, by design.** Every free family loses `/family` data at
commit. Nothing is deleted; buying Family restores it instantly.

### Step 18 — migration 043 (parent email verification, B6)
Production auto-confirms email at sign-up, so `email_confirmed_at` proves
nothing and is not used. `profiles.email_verified_at` +
`profiles.email_verified_for` + `profiles.email_verify_requested_for` +
`profiles.email_verify_requested_at` are PRIVILEGED (scrubbed on INSERT,
42501 on any client change). `request_email_verification()` (authenticated
only) spends one `email_verify` (3/hour) and records the caller's CURRENT
auth email and the time; the app calls it BEFORE `signInWithOtp` and sends
the link to the address it returns. `mark_email_verified()` stamps the
caller only when ALL hold: the JWT `amr` has an `otp`/`magiclink` entry whose
`timestamp` is at/after the request and within 60 minutes; the current auth
email = `requested_for` = the JWT's `email` claim; and the account's email has
not changed in the 24 hours before that timestamp (`public.auth_email_changes`,
written by an `AFTER UPDATE OF email` trigger on `auth.users`; no client
access). Success clears the request, so a session can stamp once. A verified
Google identity for the account email still counts. A `profile_write` refusal
raises 53400 `email_verify_rate_limited` (the app says "Too many tries"), not
"not proven". `email_is_verified(uuid)` is internal (no EXECUTE for clients)
and only counts while `email_verified_for` equals the CURRENT auth email.
`join_family()` (parents only, before the attempt is logged),
`approve_family_join()` (parents only) and `grant_parent_consent()` raise
**42501 `verify_email_required`** for an unverified parent; players are
never checked.
**Why the request columns, the timestamp and the change log (2026-11-18
review).** The first version accepted ANY otp/magiclink amr entry, ignored
its time, and stamped whatever the auth email was when called. A reviewer
proved on staging (rolled back): verify own address A by link →
`updateUser({ email: B })` (auto-confirm applies B at once) → call
`mark_email_verified()` again in the same session → B "verified" →
`approve_family_join` records under-13 consent. The 24-hour rule closes the
slower variant (ask for a code to an address you own, switch the account to
one you don't, request, then redeem the old code): Supabase caps email OTP
validity at 24 hours, so a code redeemed with no email change in the
preceding day was sent to the address the account has now. Seeded has no
email-change screen, so only someone driving the Auth API directly meets
that wait. `recovery` and `email/signup` amr methods no longer count.
**What the `email_verify` bucket does NOT do:** protect the project's email
budget. `signInWithOtp` is a public Auth endpoint reachable with the anon key
without touching Seeded's RPC; that budget rests on Supabase Auth's own rate
limits (Dashboard → Authentication → Rate Limits, and SMTP) — project
settings, not this repo.
**Staging ledger note:** staging got 043 in two steps — the first version,
then `043b_fresh_email_verification` (the delta to the fixed file).
Production runs only the fixed 043, once. Both end in the same schema.
**Apply:** `supabase/migrations/043_parent_email_verification.sql`, after 041.
**Dashboard, before the code ships:** add `<site>/auth/verified` to Auth →
URL Configuration → Redirect URLs, or the link lands on the Site URL instead.
**Pre-flight (read-only):** `select count(*) from profiles where role = 'parent';`
— every one of them must verify before they can next approve, consent, or
join. Existing approvals are not undone.
**Verify — staging, 2026-11-18, as real users:**

| probe | result |
|---|---|
| unverified parent (PB4) `approve_family_join(minor)` | **42501 verify_email_required** |
| unverified parent (PB4) `grant_parent_consent(minor)` | **42501 verify_email_required** |
| unverified parent (PB1 pending) `join_family('FAKEFAM-PB2')` | **42501 verify_email_required**; join attempts logged: **0** |
| player (PB1) `approve_family_join(pending parent)` | `approved` (unaffected) |
| player (PB5) `join_family('FAKEFAM-PB3')` | `pending` (unaffected) |
| client `update ... set email_verified_at = now()` | **42501** |
| client `update ... set email_verified_for = ...` | **42501** |
| verified parent upserting a different `email_verified_at` | **42501** |
| unverified parent upserting `email_verified_*` | succeeds, stored value stays **NULL** (scrubbed) |
| brand-new account INSERT carrying `email_verified_*` | stored **NULL** |
| `mark_email_verified()` with amr `password` / `oauth` / `token_refresh+password` | **false** (and approve still refused) |
| `mark_email_verified()` with amr `otp` / `magiclink` / `recovery` / bare-string `"otp"` | true |
| verified parent, later in a PASSWORD session: approve the under-13 | `approved`, consent `granted` |
| …after the auth email is changed | **42501 verify_email_required** again |
| previously-refused parent, after verifying: `join_family` | `pending` |
| Google identity with `email_verified: true` for the account email | `email_is_verified` → true |
| client calling `email_is_verified(other uuid)` | **42501 permission denied** |

**Re-probed after the fix (043b), staging 2026-11-18, as PB4's parent
(`…0b0401`), each in a rolled-back transaction with forged claims:**

| probe | result |
|---|---|
| request (email A) → `mark` with `magiclink` amr after it, jwt email A | `true` |
| …then auth email → B; `mark` again, same session (jwt email A) | **false** |
| …same, refreshed token (jwt email B) | **false** |
| …`request_email_verification()` right after the change | `{"allowed":false,"reason":"email_recently_changed"}` |
| …`approve_family_join(minor)` | **42501 verify_email_required** |
| request, then `otp` amr timestamped 2 min BEFORE it | **false** |
| amr `magiclink` 61 min old (request 3 h old) / control 59 min old | **false** / `true` |
| right amr, jwt `email` claim differs / absent | **false** / **false** |
| bare-string amr `"otp"` (no timestamp); amr `password`+`recovery` | **false**; **false** |
| code redeemed 2 h after an email change (request made in between) | **false** |
| NEW address B, change 25 h ago: request → fresh `otp` → mark → approve | `{"allowed":true,"email":B}` → `true` → `approved`, consent `granted`; `verified_for` = B, request cleared |
| the same session marks a second time | **false** |
| client `update ... email_verify_requested_for` / `_at` | **42501** / **42501** |
| client upsert carrying both request columns | succeeds, stored **NULL, NULL** |
| `authenticated` selects `auth_email_changes`; `anon` calls request / mark | **42501** ×3 |
| 4th `request_email_verification()` in an hour | `{"allowed":false,"reason":"rate_limited"}` |
| valid proof with `profile_write` spent | **53400 `email_verify_rate_limited`** |

**Not verified end to end:** a real magic-link email. Staging's
`auth.mfa_amr_claims` holds only `password` (no link sign-in has ever
happened there) and no fake address can receive mail. The amr values are
from the Supabase docs plus the `flow_state.authentication_method` column;
the SQL was exercised with forged claims. The fix now also relies on the amr
entry's `timestamp` being the time that session was authenticated (GoTrue
fills it from `auth.mfa_amr_claims.updated_at`) and on the JWT carrying an
`email` claim — both standard, neither observed on a real link session here.
Nor was the `auth.users` trigger fired by GoTrue itself (only by an `UPDATE`
as `postgres`). **One live check before relying on it:** on staging, sign a
real inbox you control in via `sendVerificationLink()`, open the link in the
same browser within the hour, and confirm `/auth/verified` says "Email
confirmed"; then change that account's email through the Auth API and
confirm a row appears in `auth_email_changes`.
**Rollback (runnable; restores 023/030's RPCs, 035's buckets and 041's trigger
BEFORE dropping 043's objects — the RPCs call `email_is_verified()` and the
trigger reads the columns):**
```sql
-- ROLLBACK 043 (parent email verification). Run as postgres. Restores
-- 023/030's RPCs, 041's trigger and 035's bucket list, THEN drops 043's objects.
begin;
create or replace function public.join_family(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_recent int;
  v_exists boolean;
  v_own text;
  v_existing public.parent_accounts%rowtype;
begin
  -- WHY THIS RETURNS A STATUS INSTEAD OF RAISING (found by the staging
  -- attack test, 2026-11-14):
  -- The first version logged the attempt and then RAISED for an invalid
  -- code. Raising rolls the function's own work back to its savepoint —
  -- and under PostgREST every RPC call is its own transaction — so the
  -- attempt row vanished with the exception. The rate limiter therefore
  -- counted zero failed attempts and never fired. Brute force was
  -- unlimited, which is the one thing it existed to stop.
  --
  -- So: expected outcomes (invalid / own family / already linked /
  -- pending) RETURN, which lets the attempt row commit. Only "not signed
  -- in" and "rate limited" raise, and neither needs to be logged.
  --
  -- Yes, a distinguishable 'invalid' vs 'pending' is an oracle for which
  -- codes exist. That is unavoidable — a user has to learn whether their
  -- code worked. It is acceptable only BECAUSE the rate limit now works
  -- and because a valid code on its own still grants nothing until a
  -- member approves it. If you ever weaken the rate limit, revisit this.
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select count(*) into v_recent
  from public.family_join_attempts
  where user_id = v_user and created_at > now() - interval '1 hour';

  if v_recent >= 5 then
    raise exception 'Too many attempts. Try again later.' using errcode = '53400';
  end if;

  select exists(select 1 from public.families f where f.code = p_code) into v_exists;

  insert into public.family_join_attempts (user_id, attempted_code, succeeded)
  values (v_user, p_code, v_exists);

  if not v_exists then
    return jsonb_build_object('status','invalid');
  end if;

  select family_code into v_own from public.profiles where id = v_user;
  if v_own = p_code then
    return jsonb_build_object('status','own_family');
  end if;

  select * into v_existing from public.parent_accounts
  where user_id = v_user and family_code = p_code;

  if found then
    return jsonb_build_object('status', v_existing.status, 'already', true);
  end if;

  insert into public.parent_accounts (user_id, family_code, status)
  values (v_user, p_code, 'pending');

  return jsonb_build_object('status', 'pending', 'already', false);
end;
$$;
revoke all on function public.join_family(text) from public, anon;
grant execute on function public.join_family(text) to authenticated;

create or replace function public.grant_parent_consent(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_my_role text;
  v_my_status text;
  v_child_code text;
  v_updated int;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  if p_user_id = v_user then
    return jsonb_build_object('status', 'not_allowed', 'reason', 'self');
  end if;

  select role, consent_status into v_my_role, v_my_status
  from public.profiles where id = v_user;

  if v_my_status = 'pending' then
    return jsonb_build_object('status', 'not_allowed', 'reason', 'own_account_pending');
  end if;

  if v_my_role is distinct from 'parent' then
    return jsonb_build_object('status', 'not_allowed', 'reason', 'not_a_parent_account');
  end if;

  -- The child's family: whichever of the two shapes holds it.
  select coalesce(
    (select family_code from public.profiles where id = p_user_id),
    (select family_code from public.parent_accounts
      where user_id = p_user_id and status = 'approved' limit 1)
  ) into v_child_code;

  if v_child_code is null or not public.is_family_member(v_child_code) then
    return jsonb_build_object('status', 'not_allowed', 'reason', 'not_your_family');
  end if;

  update public.profiles
  set consent_status = 'granted',
      consent_granted_at = now(),
      consent_granted_by = v_user
  where id = p_user_id and consent_status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('status', 'nothing_pending');
  end if;

  return jsonb_build_object('status', 'granted');
end;
$$;
revoke all on function public.grant_parent_consent(uuid) from public, anon;
grant execute on function public.grant_parent_consent(uuid) to authenticated;

create or replace function public.approve_family_join(p_parent_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_updated int;
  v_my_role text;
  v_consent text := null;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- 026 widened this from "the player only" to "any approved member", via
  -- my_family_code() + is_family_member(). Unchanged here.
  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
    raise exception 'You are not in a family.' using errcode = '22023';
  end if;

  update public.parent_accounts
  set status = 'approved', approved_at = now(), approved_by = v_user
  where user_id = p_parent_user_id
    and family_code = v_code
    and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'No pending request from that person.' using errcode = '22023';
  end if;

  select role into v_my_role from public.profiles where id = v_user;

  if v_my_role = 'parent' then
    update public.profiles
    set consent_status = 'granted',
        consent_granted_at = now(),
        consent_granted_by = v_user
    where id = p_parent_user_id and consent_status = 'pending';

    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      v_consent := 'granted';
    end if;
  else
    if exists (
      select 1 from public.profiles
      where id = p_parent_user_id and consent_status = 'pending'
    ) then
      -- Approved into the family, still waiting on an adult.
      v_consent := 'still_pending';
    end if;
  end if;

  return jsonb_build_object('status', 'approved', 'consent', v_consent);
end;
$$;
revoke all on function public.approve_family_join(uuid) from public, anon;
grant execute on function public.approve_family_join(uuid) to authenticated;

create or replace function public.rate_limit_for_bucket(p_bucket text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_bucket
    when 'profile_write'     then 60
    when 'utr_entry'         then 20
    when 'match_write'       then 60
    when 'outreach_write'    then 40
    when 'budget_write'      then 60
    -- Bulk: one calendar save rewrites the whole plan, row by row.
    when 'training_write'    then 2000
    when 'account_deletion'  then 5
    when 'data_export'       then 3
    when 'whop_checkout'     then 20
    when 'checkin_write'     then 60
    when 'tournament_write'  then 60
    when 'checklist_write'   then 120
    when 'settings_write'    then 60
    when 'family_write'      then 30
    when 'note_write'        then 30
    else null
  end;
$$;
revoke all on function public.rate_limit_for_bucket(text) from public, anon;
grant execute on function public.rate_limit_for_bucket(text) to authenticated;

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_is_new_account boolean;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- An upsert's INSERT branch runs even when the row exists. Only a row
    -- that does NOT exist yet is an account being created.
    v_is_new_account := not public.profile_row_exists(new.id);

    if v_is_new_account then
      -- 032: a family_code may only be claimed if nobody holds it yet.
      if new.family_code is not null and public.family_code_is_taken(new.family_code) then
        raise exception
          'Use the join code to request access to an existing family; it cannot be set on a profile directly.'
          using errcode = '42501';
      end if;

      -- 033: the under-13 gate cannot be skipped by omitting the field.
      if new.birth_year is null then
        raise exception 'A birth year is required to create an account.'
          using errcode = '23502';
      end if;
    end if;

    -- Always scrubbed, new row or not: these are never the client's to set.
    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;

    if v_is_new_account then
      new.consent_status :=
        case when public.consent_required_for_birth_year(new.birth_year)
             then 'pending' else 'not_required' end;
      new.consent_granted_at := null;
      new.consent_granted_by := null;
    end if;
    -- When the row already exists the consent columns are left as the
    -- payload had them and never read here; see 035 for why that is safe
    -- (DO UPDATE SET only assigns payload columns, and the UPDATE branch
    -- below forces consent from OLD).

    return new;
  end if;

  if new.subscription_tier      is distinct from old.subscription_tier
  or new.whop_membership_id     is distinct from old.whop_membership_id
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.role                   is distinct from old.role
  or new.family_code            is distinct from old.family_code
  then
    raise exception 'This profile field can only be changed by Seeded.'
      using errcode = '42501';
  end if;

  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;

  -- 041: birth_month is write-once, like birth_year. A null may be filled in
  -- once (onboarding, or an account that predates 041); after that only
  -- Seeded can change it. Re-sending the same value is not a change.
  if old.birth_month is not null and new.birth_month is distinct from old.birth_month then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;

  if old.birth_year is null and new.birth_year is not null then
    new.consent_status :=
      case when public.consent_required_for_birth_year(new.birth_year)
           then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
  else
    new.consent_status     := old.consent_status;
    new.consent_granted_at := old.consent_granted_at;
    new.consent_granted_by := old.consent_granted_by;
  end if;

  return new;
end;
$fn$;
revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;

drop trigger if exists seeded_note_auth_email_change on auth.users;
drop function if exists public.note_auth_email_change();
drop function if exists public.request_email_verification();
drop function if exists public.mark_email_verified();
drop function if exists public.email_is_verified(uuid);
drop table if exists public.auth_email_changes;
alter table public.profiles drop column if exists email_verify_requested_at;
alter table public.profiles drop column if exists email_verify_requested_for;
alter table public.profiles drop column if exists email_verified_for;
alter table public.profiles drop column if exists email_verified_at;
commit;
```
**Risk: medium.** Every existing parent becomes unable to approve, consent or
join until they click a link; the link depends on SMTP (80/hour project-wide)
and on the redirect allow-list.

### Step 19 — migration 044 (the roster respects the Family plan)
**Why:** 042 locked every cross-member read behind the Family plan but left
`family_members()` alone (Step 17's "Not gated" list), and the roster still
returned each member's `current_utr`, `grade`, `graduation_year`,
`target_school_slugs` and `gender` to a FREE family — a side door around the
paywall: a free parent read 0 of the player's `utr_entries` and the player's
current UTR straight off the roster.
**What:** same signature, same 15 columns in the same order, same row set.
Those five columns are NULL unless `family_has_tier(<caller's code>,
'family')` (042's own predicate), except on the caller's OWN row (readable
from `profiles` anyway). Ungated, because a free family must still form:
`user_id, name, email, role, status, is_creator, joined_at, reminded_at,
consent_status, onboarded`. `create or replace` (identical return type, so
grants are kept); the revoke/grant pair is re-asserted.
**Apply:** `supabase/migrations/044_roster_respects_family_plan.sql`, after
042 (it calls `family_has_tier`).
**Pre-flight:** none (no data change). The app code that reads the nulls
honestly (`rosterStatsLocked()`, lib/family-view.ts) should ship with it, or a
free parent's /schools says "hasn't logged a UTR yet" for a child who has one.
**Verify — staging, 2026-11-18, as real users** (`set local role
authenticated` + claims; compared row-for-row against 038's body run as a
temp function in the same session):

| identity | `my_family_has_tier('family')` | roster rows (044 / 038) | identity columns identical to 038 | other members' stats visible |
|---|---|---|---|---|
| PB1 parent (free) | false | 3 / 3 | yes | **0** (player's UTR 8.40 → NULL; own row kept) |
| PB1 player (free, holder) | false | 3 / 3 | yes | **0** (own 8.40 / 2028 shown) |
| PB1 pending parent | false | 0 / 0 | yes | — (as before) |
| PB2 parent (parent pays) | true | 2 / 2 | yes, **whole rows identical** | 1 (9.10) |
| PB3 parent (player pays) | true | 2 / 2 | yes, whole rows identical | 1 (10.20) |
| PB4 parent (free, minor pending) | false | 2 / 2 | yes | 0 |
| PB4 minor (pending) | false | 0 / 0 | yes | — |
| A1 stranger joiner (holder pays) | true | 7 / 7 | yes, whole rows identical | 6 |

Downgrade / upgrade, in a rolled-back subtransaction: PB2 payer → `free`:
parent and player both see 0 stats (rows still 2); payer → `player`: still 0;
back to `family`: player's 9.10 again. A1 holder → `free`: the joiner and
parent2 see 7 rows, all four players' UTR NULL. PB1 player → `family`: PB1
parent sees 8.40. Tiers afterwards unchanged (checked). Grants after apply:
`authenticated`, `postgres`, `service_role` — `anon` and `PUBLIC` false.
Rollback rehearsed in a rolled-back subtransaction: PB1 parent sees 8.40
again, grants unchanged.
**Guard:** `lib/db/family-roster-shape.test.ts` ("044") parses the LAST
definition and fails unless each of the five columns is `case when <cond>
then x.<col> end` with `<cond>` resolving (through the function's own
aliases) to `family_has_tier(..., 'family')`, and the plan never appears in a
WHERE. Eight mutants (gate removed, one column bare, constant condition,
constant plan CTE, wrong tier, own-row exception widened, plan moved into
WHERE, a column dropped) are test cases; a hand mutation of the real file
(`grade` left bare) fails it too. `lib/db/family-plan-lock.test.ts` now allows
the roster to reference the plan for columns only.
**Rollback (runnable; restores 038's definition verbatim). Run BEFORE 042's
rollback if both go — this body calls `family_has_tier()`:**
```sql
-- ROLLBACK 044. Run as postgres.
begin;
create or replace function public.family_members()
returns table (
  user_id uuid, name text, email text, role text, status text,
  is_creator boolean, joined_at timestamptz, reminded_at timestamptz,
  consent_status text, current_utr numeric, grade integer,
  graduation_year integer, onboarded boolean,
  target_school_slugs text[], gender text
)
language sql
security definer
set search_path = public
stable
as $fn$
  with fam as (select public.my_family_code() as code),
  both_shapes as (
    select p.id as user_id,
           coalesce(nullif(p.name,''),'Family member') as name,
           p.email,
           coalesce(p.role,'player') as role,
           'approved'::text as status,
           p.created_at as joined_at,
           null::timestamptz as reminded_at,
           p.consent_status,
           p.current_utr, p.grade, p.graduation_year, p.onboarded,
           p.target_school_slugs, p.gender,
           2 as shape_rank
    from public.profiles p, fam
    where fam.code is not null
      and p.family_code = fam.code
      and public.is_family_member(fam.code)
    union all
    select pa.user_id,
           coalesce(nullif(p2.name,''),'Family member'),
           p2.email,
           coalesce(p2.role,'parent'),
           pa.status,
           pa.created_at,
           pa.reminded_at,
           p2.consent_status,
           p2.current_utr, p2.grade, p2.graduation_year, p2.onboarded,
           p2.target_school_slugs, p2.gender,
           1
    from public.parent_accounts pa
    join public.profiles p2 on p2.id = pa.user_id, fam
    where fam.code is not null
      and pa.family_code = fam.code
      and public.is_family_member(fam.code)
  ),
  one_per_member as (
    select distinct on (b.user_id)
           b.user_id, b.name, b.email, b.role, b.status,
           b.joined_at, b.reminded_at, b.consent_status,
           b.current_utr, b.grade, b.graduation_year, b.onboarded,
           b.target_school_slugs, b.gender
    from both_shapes b
    order by b.user_id, (b.status = 'pending') desc, b.shape_rank
  )
  select m.user_id, m.name, m.email, m.role, m.status,
         m.user_id = public.family_account_holder((select code from fam)) as is_creator,
         m.joined_at, m.reminded_at, m.consent_status,
         m.current_utr, m.grade, m.graduation_year, m.onboarded,
         m.target_school_slugs, m.gender
  from one_per_member m
  order by 6 desc, 5, 7
$fn$;
revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;
commit;
```
**Risk: low.** No data change, no row-set change; free families' roster
cards keep names, roles and approvals. `/privacy` (lib/legal/policy.ts) says
the five details need the Family plan.

### Step 20 — migration 045 (one Family plan = one family; 4 players, 2 parents)
**Owner decision, 2026-11-19 (docs/DECISIONS.md): RESTRICT.** 042 let one
Family plan unlock every family its holder was approved into. 045:
- `home_family_code(uuid)` — the one family an account belongs to: its
  profile's `family_code`, else its earliest APPROVED `parent_accounts` row
  (ties broken by `created_at`, then code). `my_family_code()` now returns
  `home_family_code(auth.uid())`, so the app's "my family" and the payer's
  home family are the same rule by construction. Internal (no client EXECUTE:
  it would name the family of any uuid).
- `family_has_tier(code, 'family')` additionally requires
  `home_family_code(payer) = code`. Every other branch is 042's.
- Caps: `family_member_cap(role)` (player 4, parent 2) and
  `family_member_count(code, role)` (approved, either shape, one per person).
  `join_family()` RETURNS `{"status":"family_full","role":…,"limit":…}` before
  creating a pending row (the attempt still logs — 023's rate-limit lesson);
  `approve_family_join()` raises **P0001 `family_full_<role>`**. Both take a
  per-family advisory lock. Existing members are never removed; an over-cap
  family simply cannot grow.
**Apply:** `supabase/migrations/045_family_plan_one_family_and_caps.sql`, after 044.
**Pre-flight (read-only, production) — must show every payer at home and nobody over a cap:**
```sql
select left(p.id::text,8) as payer, p.role,
       coalesce(p.family_code, (select pa.family_code from public.parent_accounts pa
         where pa.user_id = p.id and pa.status = 'approved'
         order by pa.approved_at nulls last, pa.created_at, pa.family_code limit 1)) as home_family,
       (select count(*) from public.parent_accounts pa where pa.user_id = p.id and pa.status = 'approved') as other_links
from public.profiles p where p.subscription_tier = 'family';
select f.code, p.role, count(*) from public.families f join public.profiles p
  on (p.family_code = f.code or exists (select 1 from public.parent_accounts pa
      where pa.user_id = p.id and pa.family_code = f.code and pa.status = 'approved'))
group by 1, 2 having (p.role = 'player' and count(*) > 4) or (p.role = 'parent' and count(*) > 2);
```
2026-11-19: two payers (both players, `other_links` 0, each at home in the
family they pay for — NIRAN-0FI8 and JORDA-0N6T); no family over a cap;
nobody in two families. **So 045 changes no one's access on the day.**
**Verify — staging, 2026-11-19, as real users (rolled back):**

| probe | result |
|---|---|
| PB2 parent / PB2 player / PB3 player / PB3 parent `my_family_has_tier('family')` | t / t / t / t |
| PB1 player / PB1 parent / PB5 player | f / f / f |
| PB3's payer approved INTO PB1 → PB1 parent tier; PB1 player's `utr_entries` | **f; 0** |
| …same, with 042's `family_has_tier` put back (mutant) | t; 3 — the home check is what refuses |
| PB3 parent (payer's home) | t |
| 4th player join → approve | `pending` → `approved` |
| 5th player join | **`family_full` (player, 4)**; 0 `parent_accounts` rows; attempt logged |
| approve a 5th player already pending | **P0001 `family_full_player`**; still pending |
| …with the player cap raised to 5 (mutant) | `pending` — the cap is what refuses |
| 2nd parent approve; 3rd parent (email proven) join | `approved`; **`family_full` (parent, 2)** |
| approve a 3rd parent already pending | **P0001 `family_full_parent`** |
| joiner pays for PB3 → player tier; `remove_family_member(payer)` → player tier | t → **f**; payer's `my_family_code` NULL |
| PB5 with 7 players inserted over the cap | roster 7 rows (nobody removed); 8th join `family_full` |
| `authenticated` calls `home_family_code` / `family_member_count` / `family_member_cap` | **42501** ×3 |

**Independent review, 2026-11-19 — one HIGH, fixed in this same file and
re-probed (staging got it as the delta `045b_family_cap_requires_profile`;
production runs only the fixed 045, once):** an account with NO profile row
has no role, so it skipped the cap (`family_member_cap(NULL)` was NULL) and
043's parent check, could be approved by calling the RPC directly, and then
created its profile as a player. Now `join_family` raises 22023
`profile_required` before anything is logged, `approve_family_join` refuses a
pending account with no profile, and the cap fails closed (`else 0`).

| re-probe (rolled back) | result |
|---|---|
| auth user with no profile: `join_family('FAKEFAM-PB1')` | **22023 `profile_required`**; attempts logged 0; parent_accounts rows 0 |
| pending row for that account: PB1 player approves it | **22023 `profile_required`**; row still pending |
| `family_member_cap(NULL)` / `('coach')` | 0 / 0 |
| control: same account after creating its profile joins | `pending` |

The rollback below was itself run on staging inside a rolled-back
transaction: helpers gone, the four functions back to their pre-045 bodies
(043's email check kept), grants intact, and a payer approved into a second
family unlocked it again (the old behaviour).
**Rollback (runnable):**
```sql
-- ROLLBACK 045 (one family per plan + caps). Run as postgres, BEFORE 044's
-- rollback if both are rolled back. Restores 026's my_family_code, 042's
-- family_has_tier and 043's join_family / approve_family_join verbatim,
-- THEN drops 045's helpers (my_family_code and family_has_tier call them).
begin;
-- my_family_code: verbatim from 026_family_approval_flow.sql
create or replace function public.my_family_code()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.family_code from public.profiles p where p.id = auth.uid()),
    (select pa.family_code from public.parent_accounts pa
      where pa.user_id = auth.uid() and pa.status = 'approved'
      order by pa.approved_at nulls last limit 1)
  )
$$;
revoke all on function public.my_family_code() from public, anon;
grant execute on function public.my_family_code() to authenticated;
-- family_has_tier: verbatim from 042_family_plan_lock.sql
create or replace function public.family_has_tier(p_code text, p_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when p_tier = 'free' then true
    when p_code is null or p_tier is null or p_tier not in ('player', 'family') then false
    -- Only ever an answer about the caller's OWN family. No caller (service
    -- role, postgres) = no restriction.
    when auth.uid() is not null and not public.is_family_member(p_code) then false
    else exists (
      select 1
      from public.profiles p
      where (
              p.family_code = p_code
              or exists (
                select 1 from public.parent_accounts pa
                where pa.user_id = p.id
                  and pa.family_code = p_code
                  and pa.status = 'approved'
              )
            )
        and (
              (p_tier = 'player' and p.subscription_tier in ('player', 'family'))
           or (p_tier = 'family' and p.subscription_tier = 'family')
            )
    )
  end
$fn$;
revoke all on function public.family_has_tier(text, text) from public, anon;
grant execute on function public.family_has_tier(text, text) to authenticated, service_role;
-- join_family: verbatim from 043_parent_email_verification.sql
create or replace function public.join_family(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_recent int;
  v_exists boolean;
  v_own text;
  v_existing public.parent_accounts%rowtype;
begin
  -- WHY THIS RETURNS A STATUS INSTEAD OF RAISING: see 023. Expected outcomes
  -- RETURN so the attempt row commits and the rate limiter counts it. Only
  -- "not signed in", "rate limited" and (043) "verify your email" raise, and
  -- none of them needs to be logged.
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- 043: a parent account must have proven its email before it can ask to
  -- join a family. Checked BEFORE the attempt is logged or the code is
  -- looked up: the caller learns nothing about the code and spends none of
  -- the 5/hour budget. Players are never checked.
  if exists (select 1 from public.profiles where id = v_user and role = 'parent')
     and not public.email_is_verified(v_user) then
    raise exception 'verify_email_required' using errcode = '42501';
  end if;

  select count(*) into v_recent
  from public.family_join_attempts
  where user_id = v_user and created_at > now() - interval '1 hour';

  if v_recent >= 5 then
    raise exception 'Too many attempts. Try again later.' using errcode = '53400';
  end if;

  select exists(select 1 from public.families f where f.code = p_code) into v_exists;

  insert into public.family_join_attempts (user_id, attempted_code, succeeded)
  values (v_user, p_code, v_exists);

  if not v_exists then
    return jsonb_build_object('status','invalid');
  end if;

  select family_code into v_own from public.profiles where id = v_user;
  if v_own = p_code then
    return jsonb_build_object('status','own_family');
  end if;

  select * into v_existing from public.parent_accounts
  where user_id = v_user and family_code = p_code;

  if found then
    return jsonb_build_object('status', v_existing.status, 'already', true);
  end if;

  insert into public.parent_accounts (user_id, family_code, status)
  values (v_user, p_code, 'pending');

  return jsonb_build_object('status', 'pending', 'already', false);
end;
$$;
revoke all on function public.join_family(text) from public, anon;
grant execute on function public.join_family(text) to authenticated;
-- approve_family_join: verbatim from 043_parent_email_verification.sql
create or replace function public.approve_family_join(p_parent_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_updated int;
  v_my_role text;
  v_consent text := null;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- 043: a PARENT approving must have proven their email (approving as a
  -- parent also records consent for a pending under-13, below). A player
  -- approving is never checked.
  if exists (select 1 from public.profiles where id = v_user and role = 'parent')
     and not public.email_is_verified(v_user) then
    raise exception 'verify_email_required' using errcode = '42501';
  end if;

  -- 026 widened this from "the player only" to "any approved member", via
  -- my_family_code() + is_family_member(). Unchanged here.
  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
    raise exception 'You are not in a family.' using errcode = '22023';
  end if;

  update public.parent_accounts
  set status = 'approved', approved_at = now(), approved_by = v_user
  where user_id = p_parent_user_id
    and family_code = v_code
    and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'No pending request from that person.' using errcode = '22023';
  end if;

  select role into v_my_role from public.profiles where id = v_user;

  if v_my_role = 'parent' then
    update public.profiles
    set consent_status = 'granted',
        consent_granted_at = now(),
        consent_granted_by = v_user
    where id = p_parent_user_id and consent_status = 'pending';

    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      v_consent := 'granted';
    end if;
  else
    if exists (
      select 1 from public.profiles
      where id = p_parent_user_id and consent_status = 'pending'
    ) then
      -- Approved into the family, still waiting on an adult.
      v_consent := 'still_pending';
    end if;
  end if;

  return jsonb_build_object('status', 'approved', 'consent', v_consent);
end;
$$;
revoke all on function public.approve_family_join(uuid) from public, anon;
grant execute on function public.approve_family_join(uuid) to authenticated;
drop function if exists public.family_member_count(text, text);
drop function if exists public.family_member_cap(text);
drop function if exists public.home_family_code(uuid);
commit;
```
**Risk: low on the day** (pre-flight shows no family changes), **by design
afterwards**: a payer approved into a second family no longer unlocks it, and
a full family cannot grow. App: `lib/db/family-join.ts` maps both answers to
"This family already has 4 players. Contact support@seededtennis.com" (or 2
parents); `lib/family-plan-scope.test.ts` pins the caps and the SQL order.

### After
- [ ] Re-run the schema fingerprint; prod and staging should now match exactly again
- [ ] Update `docs/DATABASE_SPEC.md`: mark 022–039 applied to production, with the date
- [ ] Regenerate `lib/db/database.types.ts` against production (`generate_typescript_types`) — `parent_accounts` gained four columns, `profiles` four, and `rate_limit_events` is new
- [ ] Turn on Supabase leaked-password protection and a minimum password length (Dashboard → Authentication → Policies). The advisor WARNs on it, and S-6 cannot cover login/signup/reset from app code — those requests never touch a Seeded route
- [ ] Review Supabase Auth's own per-IP rate limits (Dashboard → Authentication → Rate Limits) for signup, login and password reset
- [x] Point Vercel **Preview** and local **Development** at staging (P0-6's remaining half) — done 2026-11-14: all three Supabase vars are Production-only, and Preview/Development carry their own pointing at `gnlcpnsweqbtwpaqhqqg`
- [ ] **Credentials: NOT done, and this line used to claim it was.** What is
      true: `GEMINI_API_KEY` was deleted from Vercel, and the Whop key was
      verified never committed. What is NOT true: that nothing needs
      revoking. **Deleting an env var is not revoking a key at the
      provider** — the Gemini key still works wherever it has been seen, and
      `GEMINI_API_KEY` is still present in the local `.env.local`. CLAUDE.md
      has said "The Gemini and Stripe keys still need revoking at the
      provider" the whole time, so this document and that one contradicted
      each other on a security item. Three to revoke at the provider, per
      the standing note: **Whop** (exposed twice in terminal screenshots),
      **Gemini** and **Stripe** (their code is deleted; the keys are not).
      Niran's to do, in each provider's dashboard.

### Step 21 — migration 046 (`leave_family()`, PR D / D6)

Settings → Family's "Leave family". Caller-only (no arguments), SECURITY
DEFINER, `search_path = public`, revoked from public/anon, granted to
authenticated. Leaves the caller's home family (`my_family_code()`): deletes
only the caller's `parent_accounts` rows for that code and clears the
caller's own `profiles.family_code` under `remove_family_member()`'s guard;
refuses the account holder (`account_holder_cannot_leave`) and a caller with
no approved family (`not_in_a_family`); an under-13 left with no family goes
back to `consent_status = 'pending'`. Rows the leaver wrote keep their stamp
but stop being readable by the family (036 keys on current membership).

Staging probes (2026-11-19, `set local role authenticated` + claims, rolled
back): joined parent leaves → `left`, roster 3 → 0; double-linked player →
`left`, own `family_code` cleared; consented under-13 → `left`,
`consent_reset: true`, other members' links unchanged; holder → 22023
`account_holder_cannot_leave`; pending-only → 22023 `not_in_a_family`; anon →
42501.

Rollback: `drop function if exists public.leave_family();`

### Step 22 — migration 047 (tournament status 'played', PR D / D4)

Widens `tournament_entries_status_check` to ('saved','entered','played'). No
rows rewritten ('saved' displays as "Planning"). MUST be on production before
the PR D code merges.

Verify: the constraint lists three values; `select status, count(*) from
tournament_entries group by 1` unchanged; as a row's owner → 'played' ok,
'planning' 23514, another user's row 0 rows.

Rollback:
```sql
begin;
update public.tournament_entries set status = 'entered' where status = 'played';
alter table public.tournament_entries drop constraint tournament_entries_status_check;
alter table public.tournament_entries add constraint tournament_entries_status_check
  check (status = any (array['saved'::text, 'entered'::text]));
commit;
```

### Step 23 — migration 049 (tournaments planned, not invented; fix/no-invented-goal)

`profiles.tournaments_goal` becomes nullable with NO default; every stored
value is set to NULL (all are the invented 12 — production 8 of 8 profiles
= 12/0 on 2026-11-20); CHECK `null or between 0 and 60`.
`tournaments_played` is untouched (the app stops reading/writing it).
MUST be on production before the fix/no-invented-goal code merges: the new
code reads NULL as "Not set" and a player who clears the field sends NULL,
which the pre-049 NOT NULL refuses (23502).

Pre-flight (read-only): `select tournaments_goal, tournaments_played,
count(*) from public.profiles group by 1, 2;` — expect only 12/0. STOP if
any other value exists: someone chose it, so clear only the 12s instead.

Verify:
```sql
select is_nullable, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'tournaments_goal';
-- YES, NULL
select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_tournaments_goal_check';
-- CHECK (((tournaments_goal IS NULL) OR ((tournaments_goal >= 0) AND (tournaments_goal <= 60))))
select count(*) filter (where tournaments_goal is not null) from public.profiles;  -- 0
```
Then as a real user (`set local role authenticated` + `request.jwt.claims`,
inside `begin … rollback`): an app-shaped upsert of the caller's own row
with `tournaments_goal` 8 → stored 8; with NULL → stored NULL; with -1 or 61
→ **23514**; an UPDATE of another user's row → 0 rows.

Staging (gnlcpnsweqbtwpaqhqqg, 2026-11-20; ledger now ends 045, 045b, 046,
048, 047, 049): before 32/32 profiles = 12/0; after `YES / default=NULL`,
the CHECK above, `32 unset / 0 set`. As `fake-a-player@example.com`
(current_user `authenticated`): upsert 8 → `8`; upsert NULL → `NULL`; rows
visible `1`; UPDATE `fake-a-sibling` → `0` rows; upsert -1 → `23514
profiles_tournaments_goal_check`; UPDATE 61 → `23514`. After rollback both
rows still NULL/0.

Rollback (RE-INVENTS the 12 — NOT NULL needs a value; roll the app back
first):
```sql
begin;
update public.profiles set tournaments_goal = 12 where tournaments_goal is null;
alter table public.profiles drop constraint if exists profiles_tournaments_goal_check;
alter table public.profiles add constraint profiles_tournaments_goal_check check (tournaments_goal >= 0);
alter table public.profiles alter column tournaments_goal set default 12;
alter table public.profiles alter column tournaments_goal set not null;
commit;
```

### Step 4b — the family-linking code (RESOLVED 2026-11-14)

The blocker recorded here on 2026-11-14 ("`lib/auth.ts` is incompatible with
023") is **fixed on `v1`.** All three breakages are closed:

1. the `families` lookup is gone — joining goes through `join_family()`
2. the direct `parent_accounts` upsert is gone — the RPC creates the row
3. the profile write no longer sets `family_code` on a joiner, and uses
   `insert` rather than `upsert` so it can never take 022's UPDATE path

`generateFamilyCode()` now uses `crypto.getRandomValues` with the same
alphabet and length as the database's `generate_family_code()`, so the old
`FIRSTNAME-XXXX` from `Math.random()` is gone from both sides.

New UI, all reusing existing Seeded components:
- `join-requests-card.tsx` — the approve/deny card, on `/today` and
  `/family`. Renders nothing when there is nothing pending.
- `family-pending-screen.tsx` — the joiner's waiting screen, plus the
  declined and not-in-a-family states and the shared code form.
- `family-members-card.tsx` — rewritten to read `family_members()` instead
  of selecting `profiles` by `family_code`, which silently omitted every
  joined parent once they stopped carrying the code.

**The code and migrations 023 + 026 must ship together.** The code calls
RPCs that do not exist before them; the migrations close table access the
old code depends on. Neither half works alone.

**Still a product gap, not a blocker:** "Remind them" sends nothing. Seeded
has no email or push, so it bumps a timestamp that re-sorts the request on
the approver's card, and the copy says exactly that. If you want a real
notification, that is a provider decision (POST-V1).

### What this plan deliberately does NOT do
- It does not rewrite `lib/auth.ts` (see the blocker above) — that is a
  change to how family linking works, which needs sign-off, not a
  drive-by edit at the end of a migration session.
- It does not drop `badges`/`friendships`/`are_friends()` (P3).
- It does not touch `profiles.stripe_*` columns (kept until a cleanup migration).

---

## K. Billing — the webhook has never fired (written 2026-11-14)

Read this before touching anything Whop.

### What is true

- Real payments succeeded on **2026-10-03** and **2026-11-02** (Player,
  $19/mo). Confirmed read-only against production: that buyer's profile is
  still `subscription_tier = 'free'` with `whop_membership_id = null`. **They
  paid and got nothing**, and nothing in the product told them so.
- Webhook `hook_ActwvOQFQX4Pm` → `https://seededtennis.com/api/whop/webhook`,
  subscribed to `membership.activated` / `.updated` / `.deactivated`, shows
  **"No deliveries yet"**. Not failed deliveries — zero attempts.
- The webhook list shows API version **"v1"**; the edit form shows
  **"legacy"**.

### Why it never delivered

The SDK settles it. `Webhook.api_version` is one of `v1`, `v2`, `v5`, and the
type's own doc comment calls v2/v5 **"legacy"**. The dot-form event names
(`membership.activated`) are the **v1** vocabulary. So an endpoint pinned to
a legacy payload version, subscribed to v1 event names, matches nothing and
is never sent anything. That is exactly the "no deliveries at all, not failed
deliveries" signature.

It would also have failed if it HAD delivered. `unwrapWebhook` from
`@whop/sdk/helpers` implements Standard Webhooks (`webhook-id` /
`webhook-timestamp` / `webhook-signature`) with a `ws_` secret — Whop's v1
scheme. A legacy delivery signs differently and would be rejected 400.

So the endpoint has to be **v1**, both to receive anything and to verify.

A second, independent problem that would have bitten later: the maintenance
middleware on `main` matches every path, `/api/whop/webhook` included, and
returns 503. Since 2026-11-14 that blocks both new deliveries and any replay.
It post-dates both payments, so it is not the cause — but it must be fixed
before any replay is attempted, or the replay will fail too.

### What could not be checked, and why — RESOLVED 2026-11-15

**This section described a key that no longer exists.** It said the local
`WHOP_API_KEY` could not read this account's own data: `memberships.list`,
`webhooks.list` and `webhooks.retrieve` all returned **401 Authentication
failed**, even scoped to `biz_UskbjibeFag2Pv`, so the webhook's
`api_version` could not be confirmed from the API and both
`/api/whop/membership` and `/api/whop/sync` were effectively dead.

Niran rolled the key. Re-tested on the current Owner-role key: both
`memberships.list` and `webhooks.retrieve` on `hook_ActwvOQFQX4Pm` return
**200**. So:

- `/api/whop/membership` can now actually populate the billing tab.
- `/api/whop/sync` can now actually reconcile a membership, which makes it a
  real safety net rather than an honest no-op.
- The webhook's `api_version` IS checkable from the API now — worth doing as
  step 0 of §K rather than trusting the dashboard's rendering of it.

One genuine quirk survives and is not an auth problem: **`plans.list` takes
`account_id`, not `company_id`.** A `company_id` call fails in a way that
looks like the old 401 and is not.

The original 401 diagnosis is kept above because it explains two years of
`null` billing data, not because it is still true. Do not re-derive it.

### Dashboard changes — Niran's, in order

1. **Set the endpoint's API version to v1.** This is the fix. Whop's edit
   form for `hook_ActwvOQFQX4Pm` shows "legacy"; it must read v1. If the
   version cannot be changed on an existing endpoint, delete it and create a
   new one on v1 with the same URL and the same three events.
2. **Copy the signing secret into Vercel as `WHOP_WEBHOOK_SECRET`** (it
   starts `ws_`). Creating a new endpoint issues a NEW secret — the old value
   will verify nothing.
3. **Check the API key's scopes.** It must be able to read the account's
   memberships (and, for the email fallback to be useful, member emails). The
   current one cannot. Replace it if needed and update `WHOP_API_KEY`.
4. **Amend the maintenance middleware on `main`** so the webhook is
   reachable. One token:
   ```ts
   matcher: ["/((?!_next/static|_next/image|favicon.ico|api/whop/webhook).*)"],
   ```
   A PR into `main` — branch protection requires one, and `verify` must pass.
5. **Then replay.** With the endpoint on v1 and the path reachable, use
   Whop's replay on the missed `membership.activated` events, or just have
   the buyer open the site: the new `?checkout=success` sync is not the only
   path, but reconciling by hand is still fine — see below.
6. **Reconcile the two existing customers by hand if replay does not.** Set
   `subscription_tier` and `whop_membership_id` on their profiles with the
   service role, from the membership ids in the Whop dashboard. Do it
   deliberately; they have been paying for a product they could not use.

### Add the six plan IDs to Vercel (Production)

Read from the Whop API on 2026-11-14:

| Variable | Plan ID | Price |
|---|---|---|
| `WHOP_PLAN_PLAYER_MONTHLY` | `plan_iWNSNKqks0ddp` | $12 / month |
| `WHOP_PLAN_PLAYER_YEARLY` | `plan_uh50GMFYQVxAc` | $99 / year |
| `WHOP_PLAN_FAMILY_MONTHLY` | `plan_0z5e439ZymJC9` | $19 / month |
| `WHOP_PLAN_FAMILY_YEARLY` | `plan_06ceyeQdTKF29` | $159 / year |
| `WHOP_PLAN_PLAYER` (legacy, keep) | `plan_TdtqfjDqtjGOq` | $19 / month |
| `WHOP_PLAN_FAMILY` (legacy, keep) | `plan_8ybt0oV8kZ79m` | $39 / month |

**Do not delete the two legacy variables.** People are subscribed on those
plans; without the ids, a webhook for one of their memberships resolves to
`free` and the guard refuses to act — so they would silently stop being
upgraded. They are resolve-only: `planIdFor()` never returns them, so no new
checkout can start on an old price.

Note the collision: **the new Family monthly is $19, the same number as the
old Player monthly.** Nothing in the code keys off a price any more, but a
human reading a dashboard will be caught by it.

### End-to-end test for $0, before launch

1. In Whop, create a **promo code at 100% off**, restricted to
   `plan_iWNSNKqks0ddp` (Player monthly), limit 1 use, expiring in a day.
2. Create a throwaway Seeded account — a clearly fake address, per CLAUDE.md
   — on **staging**, and confirm it reads `free`.
3. From `/pricing`, leave the toggle on **Monthly** and choose Player. Check
   the Whop checkout page shows **$12**, then apply the promo code and
   confirm **$0**.
4. Complete the checkout. You should land back on `/dashboard?checkout=success`
   and see "Confirming your payment with Whop…" then "You're all set".
5. Confirm all three, in this order — each tells you something different:
   - `profiles.subscription_tier = 'player'` and `whop_membership_id` set
   - the Whop dashboard shows a delivery for `membership.activated` with a
     2xx (this is the webhook finally working)
   - `/outreach` loads instead of the paywall
6. Repeat on **Yearly** with a second promo code and confirm the checkout
   shows **$99** and the plan id is `plan_uh50GMFYQVxAc`.
7. Cancel the membership in Whop and confirm the profile returns to `free`.
8. Delete the throwaway account (`delete_my_account()`, migration 029) and
   the promo codes.

If step 5's webhook delivery is still missing but the tier is correct, the
sync did it — that is the safety net working and the webhook still broken.
Say so rather than calling it fixed.

### What the code now does

- `lib/whop.ts` — one registry; `tierForPlanId()` resolves all six plans,
  `planIdFor()` sells only the new four, `priceUsdForPlanId()` reports what a
  membership actually bills (a renewal on the old $19 plan is reported as
  $19, not $12).
- `lib/whop-sync.ts` — the single place a membership becomes a tier, with the
  anti-downgrade guard, used by both the webhook and the sync.
- `/api/whop/webhook` — email fallback when checkout metadata is absent
  (requires exactly one matching profile; ambiguity does nothing), logs and
  returns 200 on an unmatched membership instead of throwing.
- `/api/whop/sync` + `components/shared/checkout-sync.tsx` — the
  `?checkout=success` safety net. Idempotent, server-only, and it says
  "couldn't confirm" rather than guessing.
- Prices live only in `TIER_PRICE_USD` (lib/types). The pricing page, the
  paywall and the billing tab derive from it.
