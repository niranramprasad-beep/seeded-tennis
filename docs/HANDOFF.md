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
Apply four migrations to production in order (025 → 022 → 023 → 024),
verifying after each; then revert the maintenance commit and merge `v1`
to `main` as a single PR with CI green. The database changes go FIRST and
are all backwards-compatible with the code currently on `main`, so there
is no window where deployed code is talking to a schema it doesn't
understand. Code goes last.

### Pre-flight (do all of these before touching production)
- [ ] `verify` CI job green on `v1` (P1-OPS-1; branch protection on `main` set up)
- [ ] Take a fresh production backup / PITR checkpoint. Supabase → Database → Backups. **Note the timestamp here: ______**
- [ ] Confirm production still has exactly 23 applied migrations (`list_migrations`); if it has more, someone changed it and this plan is stale
- [ ] Re-run the schema fingerprint on prod and staging. Expect them to differ ONLY by 022/023/024/025 — if anything else differs, stop
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
flow before shipping the code in step 5 — it is fine for existing users.

### Step 3 — migration 023 (P0-2: join_family RPC)
**What:** pending/approved state on `parent_accounts`; `families` readable
by members only; no direct `parent_accounts` INSERT; `join_family()` and
`approve_family_join()` RPCs; rate limiting; `generate_family_code()`;
family-read policies switched to `is_family_member()`.
**This is the only step that changes behaviour for existing users.**
It backfills every existing `parent_accounts` row to `'approved'`, so
nobody currently linked is locked out. **Verify the backfill count matches
the row count before you proceed.**
**Apply:** `supabase/migrations/023_family_join_rpc.sql`
**Verify:**
```sql
select status, count(*) from public.parent_accounts group by status;
-- expect: every pre-existing row 'approved', zero 'pending'
```
then the attack suite: stranger sees 0 families; direct `parent_accounts`
insert rejected; `join_family` on a valid code returns `pending`; a pending
link reads nothing; rate limit fires on attempt 6; an approved parent CAN
read the child's UTR history.
**Rollback:**
```sql
drop policy if exists families_readable_by_members on public.families;
create policy "families readable" on public.families
  for select to authenticated using (true);
create policy "parent_accounts_insert_self" on public.parent_accounts
  for insert to authenticated with check (user_id = (select auth.uid()));
-- restore the pre-023 helper definitions (drop the `status = 'approved'` clause)
-- and the pre-023 family-read policies from migration 021's text.
```
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
**Rollback:**
```sql
drop trigger if exists enforce_free_tier_target_limit on public.profiles;
drop policy if exists coach_outreach_write_own on public.coach_outreach;
create policy coach_outreach_write_own on public.coach_outreach
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_tier('family'));
```
**Risk: low, instantly reversible** — but if you roll this back you must
also roll back the step-5 code, or the UI offers outreach the DB refuses.

### Step 5 — the code (`v1` → `main`)
Only after steps 1–4 are applied and verified.
1. Open a PR from `v1` to `main`. CI (`verify`) must be green.
2. In that PR, **revert the maintenance commit** `d059006` (`git revert d059006`) — it is one self-contained commit that only adds `middleware.ts`.
3. Merge. Vercel auto-deploys `main` to seededtennis.com.
4. Smoke-test on production immediately: sign in; load `/today`, `/plan`, `/schools`, `/outreach`; mark a coach "emailed" (this is the P0-5 write that is broken today — it must now succeed); save a target school; as a Family account, open the parent view and edit the season budget.
**Rollback:** Vercel → Deployments → the previous production deployment →
"Promote to Production". Instant, code-only. The database changes do NOT
roll back with it — but every one of steps 1–4 is backwards-compatible
with the old code **except 024's outreach tier change**, so if you roll the
code back, also run 024's rollback SQL.

### After
- [ ] Re-run the schema fingerprint; prod and staging should now match exactly again
- [ ] Update `docs/DATABASE_SPEC.md`: mark 022/023/024/025 applied to production, with the date
- [ ] Regenerate `lib/db/database.types.ts` against production (`generate_typescript_types`) — `parent_accounts` gained three columns
- [ ] Point Vercel **Preview** and local **Development** at staging (P0-6's remaining half) so this never has to be rehearsed on prod again
- [ ] Revoke the Gemini and Stripe keys; rotate Whop

### ⛔ HARD BLOCKER before step 5 — `lib/auth.ts` is incompatible with 023

Verified by reading `completeFamilySignup()` in `lib/auth.ts` (2026-11-14).
023 breaks parent signup in **three** places, all in that one function:

1. **Line ~589, joining a family.** It validates the code with
   `supa.from("families").select("code").eq("code", …)`. 023 makes
   `families` readable by members only, so a prospective parent — who is
   by definition not yet a member — gets zero rows and the UI says
   *"That family code wasn't found."* for a perfectly valid code.
   → Replace with `supa.rpc("join_family", { p_code: … })` and branch on
   the returned status (`pending` / `invalid` / `own_family` / `already`).
   Note it RETURNS a status rather than throwing; see the comment in 023.

2. **Line ~626, the parent link.** It upserts `parent_accounts` directly.
   023 drops `parent_accounts_insert_self`, so this is rejected outright.
   → Delete it; `join_family()` creates the row.

3. **Line ~608, the profile upsert.** It writes `role` and `family_code`.
   On a genuinely new row 022 permits both, but this is an **upsert** — if
   the profile row already exists it becomes an UPDATE, which 022 rejects
   with `42501`. → Split create from update, or route it through a
   server-side path that runs as the service role.

Also: `generateFamilyCode()` (line 31) still builds `FIRSTNAME-XXXX` from
`Math.random()`. 023 ships `generate_family_code()` as a replacement; the
app should call it. Not a blocker — existing codes keep working — but the
weak generator is half of why P0-2 was exploitable.

**None of this is written yet.** Until it is, applying 023 to production
and shipping `v1` would close the security hole and break parent signup in
the same release. See `docs/TODO.md` item 1.

### What this plan deliberately does NOT do
- It does not rewrite `lib/auth.ts` (see the blocker above) — that is a
  change to how family linking works, which needs sign-off, not a
  drive-by edit at the end of a migration session.
- It does not drop `badges`/`friendships`/`are_friends()` (P3).
- It does not touch `profiles.stripe_*` columns (kept until a cleanup migration).
