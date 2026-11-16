# Seeded — overnight "every pixel" final pass (2026-11-15 → 16)

Live log. Updated after every workstream so this is resumable: on resume,
read this plus `git log --oneline` and continue from the first unfinished
item. Never redo finished work. The previous pass's log is kept below,
unchanged, under "Previous pass".

**Branch:** `v1`. **Started from:** `cb293e2`. **Baseline:** 697 tests in 53
files (the previous pass's closing number; re-measured 719 after the first
WS1 tests were added).

**Staging personas for tonight** (`gnlcpnsweqbtwpaqhqqg`, all
`fake-persona-*@example.com`, one disposable password kept only as a file
in `~/seeded-evidence/overnight/`, bcrypt hash only ever sent to SQL):

| id | account | shape |
|---|---|---|
| a | fake-persona-a | Men's 8.7, Class of 2031 (8th grade in Nov 2026 — the brief's "7th grader" is a year off), GPA 3.5, Free, 5 UTR entries 7.6 → 8.7, 2 matches, 2 events, 3 targets; JOINED family FAKEFAM-P1 |
| b | fake-persona-b | Women's 6.0, Class of 2029, GPA 3.9, solo |
| c | fake-persona-c | Men's 11.0, Class of 2027, Player tier, 4 targets, 3 outreach rows |
| d | fake-persona-d | Women's 9.4, Class of 2026, senior |
| e | fake-persona-e | Men's 4.0, Class of 2030, no GPA |
| f | fake-persona-f | Parent, CREATOR/account holder of FAKEFAM-P1, Family tier, budget $4,000 with 3 expenses, one note |
| g | fake-persona-g | Under-13 (birth year 2014), approved into FAKEFAM-P1, consent **pending** |
| j | fake-persona-j | Brand new, onboarded = false, no data |
| h | — | signed out |

**Found at session start:** the previous pass's report said the three
disposable staging passwords "are scrambled again at the end of this pass".
They were not — `fake-a-parent2@`, `fake-a-player@` and `fake-minor@` still
carried live bcrypt hashes. All three are scrambled at this pass's close-out
along with tonight's.

| Workstream | Status |
|---|---|
| 1 — parent profile fix + read-only made true | **DONE** (code + RLS attack suite); browser walk in WS3 |
| 2 — no invented data | **DONE** |
| 3 — every page, every pixel | in progress (harness built; tier 1 re-running on the fixed build) |
| 4 — data scoping audit | **DONE** (code + guard, 7 mutations fail the build) |
| 5 — truth & claims sweep | **largely DONE** — 4 HIGH false claims fixed; pricing/legal re-check in progress |
| 6 — a11y, performance, SEO | in progress (CLS, SSR, icons fixed) |
| 7 — security + privacy check | in progress (redirects, webhook replay done) |
| 8 — independent verifier | pending |

---

## WS1 — a parent's Settings is about the parent, and "read-only" is true

### Reproduced first

Signed in as persona (f) on a production build: `/settings` rendered the
PLAYER's Settings — a "Player profile" card (Full name, High school grad
year, Team, Home area, UTR profile link, Unweighted GPA, **Save changes**),
an Account tab listing "Current UTR / Grade / Class of / Gender", and the
sidebar saying "Parent view · read-only" beside it. The fields were the
parent's OWN profile columns, which nothing reads; and because the client
posts the whole merged Player on every save, saving them wrote a defaulted
gender and graduation year onto the parent's row.

### What changed

- **`ParentSettingsView`** (both designs route a parent to it): *Your
  account* (name — the only editable field; email from the auth user;
  sign-in method read from the auth identities, so a Google account is told
  there is no Seeded password rather than offered a reset; plan; Billing;
  Sign out), *Your players* (first name + last initial, class year, "View
  Avery's report"), Appearance, a **Family** tab (code from
  `my_family_code()` — the old card read `profiles.family_code`, which is
  NULL for every joiner and showed "—"; plus the member list), Billing, and
  **Privacy + data** with parent-specific copy. No Notifications tab:
  Seeded sends none.
- **Server:** `/api/profile` reads the caller's `role` from their own row
  and, for a parent, writes `name` and nothing else.
  `refuseParentPlayerDataWrite()` now runs first in all five player-data
  write routes (`utr-entries`, `matches`, `outreach`, `training/planner`,
  `training/templates`) and returns 403.
- **Every parent-reachable edit control removed:** the star and "Save to
  targets" on `/schools` and `/schools/[slug]` (a parent's "targets" were
  their own row, not their child's — wrong row AND wrong state shown),
  "Draft an email to the head coach" on the school page (it led to a
  redirect), "Add to my events" on `/tournament-fit`.
- **One story on every parent screen** — `parentScopeSentence()`:
  *"Jordan · parent of Avery · Avery's profile, results, plan and outreach
  are read-only for you. You can edit the season budget and send Avery
  notes."* on `/family`, `/family/budget`, `/family/weekly-reports`,
  `/schools`, `/settings`; the sidebar reads "Parent of Avery · read-only".
  The budget's sharing caveat (any approved joiner, including a player, can
  edit it — `is_parent_member()`, week-1 item) stays on `/privacy`.
- **The ⌘K palette still offered parents "Events"** — the dead end the last
  pass removed from the sidebar. Both now build from one
  `nav-links.ts`; `lib/nav-single-source.test.ts` fails if either grows its
  own list or a parent link points somewhere AuthGate bounces.
- **Which child?** Nine call sites each did
  `members.find((m) => m.role === "player")` — whichever row the RPC
  returned first. Persona (f)'s family has two players. One deterministic
  `pickFamilyPlayer()` (earliest joined, then id); a component picking for
  itself fails the build.
- **Export/delete told the truth for a parent.** The JSON export left out
  the notes a parent WROTE (listed as "written by another family member" —
  true from the child's side, backwards from the author's), while deletion
  deletes them. Now exported. `/privacy` and the Privacy card say what a
  parent's deletion takes with it (their profile, notes they wrote,
  expenses they entered) and what it leaves (the player, the family).
- Bonus bug: the compare tray's bulk "Save to targets" skipped the Free
  3-school check, so the UI showed three saved and the server refused them.

### RLS attack suite as persona (f) — staging, rolled back

Evidence: `~/seeded-evidence/overnight/ws1/rls-parent-attacks.json`.

| attack on the child's data | result |
|---|---|
| UPDATE child profile (name, UTR, GPA, targets) | 0 rows |
| UPDATE / DELETE child UTR entries | 0 rows / 0 rows |
| UPDATE child match, UPDATE / DELETE child events | 0 rows each |
| INSERT UTR, outreach, event, match, training plan, workout session as the child | `42501` × 6 |
| control: parent edits season budget | allowed (1 row) |
| control: parent writes a note | allowed |
| parent can still READ the child's UTR history | 5 rows |
| `profiles` rows visible to the parent | 1 (their own) |

**Stated scope, not glossed:** RLS lets any account write ITS OWN rows in
the player tables, and a parent going around the app straight to PostgREST
could still log a UTR under their own id. They cannot touch the child's
rows (above), no route of the app accepts it (403), and every family screen
reads the player's rows by the player's id. Closing the direct path is a
role check in the tables' INSERT policies — a migration, so not tonight
(ground rule 2: only for a HIGH that cannot be fixed otherwise); logged as
week 1 in `docs/TODO.md`.

---

## WS2 — no invented data

| what | where | now |
|---|---|---|
| `annualCost` (3 numbers by rank/division) and `scholarshipPercent` (3 by division), printed as "Rough scholarship value" / "Net: $…" under real school names | cost calculator + `calculateCost()` | **deleted** from the type, the math and the screen; card reads "Not available yet" |
| $115 lesson rate, $1,200 equipment, $550/tournament defaults, and a headline total computed from them before the family typed anything | cost calculator | inputs start empty; headline reads "Enter your costs" |
| "Cost, aid, and enrollment data coming soon." | `/schools/[slug]` | "not available yet", with why |
| six "Verified … coming soon." | Legacy school page | "not available yet" / "not stored by Seeded" |
| **"/methodology — Players leaving": "We turn every class label into a graduation year, then count players who finish before you'd arrive"** | `/methodology` | **HIGH — describes a computation that does not exist** (no roster rows). Now says it is not tracked and why |
| "#18 national academic ranking" with no source | school page, compare drawer | "U.S. News academic rank #18 (as entered in our catalogue; edition year not recorded)" — DATA_QUALITY rates the field "no year recorded" |
| Academic tier label "150+" for any rank over 100 | `/schools` | "Over 100" — a school ranked 120 read as 150+ |

**Two HIGH contradictions found while tracing numbers** (persona a, a
pre-junior): `/schools/[slug]` and `/plan`'s target rows each banded schools
**on today's rating** through their own `explainSchoolFit()` call, while
`/schools`, `/today` and `/family` judge a pre-junior at their junior-year
estimate. Same school, Reach on one page and Target on the other. Both now
take the band from the shared fit report (`useFitReport().bandBySlug`); the
school page also says which rating judged it ("Estimate … junior-year
estimate of X, the same rating the Schools list uses"), and for a parent it
is about the child, by name. `lib/fit-single-source.test.ts` (d) fails the
build if any `explainSchoolFit` call omits the report's band.

**Guard:** `lib/no-invented-school-data.test.ts` — 19 guessed field names
as code identifiers, 8 phrase families as rendered copy, scanned across
`app/`, `components/`, `lib/` after a new shared normaliser
(`lib/testing/source-text.ts`) decodes what earlier guards were blind to:
`&apos;`, `&#39;`/`&#x27;`, `\u2019`, `{" "}`/`{"'"}` JSX joins, and `${…}`
template slots (read as a digit, so `${n} spots open` matches "3 spots
open"). The test carries six spellings that defeated earlier guards as
cases it must catch, and the honest replacement sentence as one it must not.


---

## WS4 — every read names its subject

The previous pass fixed one loader (`loadUtrEntries`). The audit of every
read of a user-owned table found the same mistake in two more shapes:

1. **Family pooling on parent screens.** `loadMatches`,
   `loadTournamentEntries`, `loadCoachOutreach`, `loadCoachOutreachDated`,
   `loadDailyCheckins` and `loadCostCalculations` all did
   `.in("user_id", <every approved member>)` when the viewer was a parent.
   Persona (f)'s family has two players and two parents, so "coaches
   emailed / replied" on the overview and the weekly report counted both
   children (and any parent's own rows) as Avery's. Every one of them now
   takes a `DataSubject` — `"self"`, `{ userId }`, or (for the family
   budget only, which is the family's money) `"family-players"` — and the
   parent screens pass the child's id from `pickFamilyPlayer()`.
   Budget fit verdicts now judge only the shown child's own entries; a
   sibling's entry counts toward spend with a plain category chip.
2. **"RLS already does it."** The training loader read `training_plans`,
   `workout_sessions`, `saved_templates` and `user_settings` with no user
   filter, under a comment arguing RLS made it unnecessary — the exact
   reasoning behind last pass's CRITICAL. Today those policies are
   own-row, so nothing leaked; a future family policy would have put a
   sibling's sessions on the calendar silently. Filtered explicitly now,
   as is `lib/db/settings.ts`'s `user_settings` read.

Two smaller ones: the weekly report and the overview fell back to the
PARENT's own name as "the player" when no player had joined
(`playerMember?.name || player.name`).

**Guard — `lib/data-scoping.test.ts`:** user-owned tables are read only in
`lib/`; every SELECT carries `.eq("user_id", …)` / `.in("user_id",
subjectIds)` (or `.eq("family_code", …)` on a family table) **on that
query** — in its own chain or on the variable it was assigned to;
`approvedFamilyMemberIds()` is no longer allowed as a read scope; the five
family-readable loaders must take a `subject`; a parent screen calling one
without a subject fails. **Mutation-tested 7 ways**, all failing: drop the
filter from `training_plans` / `user_settings` / `utr_entries`; neutralise
the `.in` in `loadMatches` and the outreach `runSelect`; re-introduce
member pooling; call a loader bare from the weekly report; query `matches`
from a component. The first version of this test let mutation 1 through —
it accepted any filter anywhere in the function — and was tightened.

---

## WS5 — truth & claims (rendered text read against the code)

Read from the RENDERED text of every public page
(`~/seeded-evidence/overnight/text/`), each sentence checked against
`lib/school-fit.ts`, `lib/fit.ts`, the schema and RLS.

**HIGH — `/methodology`'s opening sentence was four false claims:** *"we
compare your UTR to real, dated rosters, count who's graduating, add
academics, and give you a band with a confidence level."* No roster is
stored, no date exists, nothing counts graduates, academics are a filter,
no confidence is computed. The page also said team ranges are "built from
public UTR profiles" (no source exists — DATA_QUALITY: UNVERIFIED), listed
per-player "Ratings" and "Academics: public admissions ranges" (neither is
stored), described a "Which ratings count" reliability filter over player
ratings that do not exist, and said "players leaving, academics and your
preferences can move a school up or down one band". Rewritten from the
code: two hand-entered estimates per team, four bands defined exactly as
`classifySchoolFit` computes them, the junior-year projection explained,
and — new — **the top of every range bar is drawn, not data**
(`schoolUtrRange` mirrors the floor around the average). The tooltip now
says "Top (drawn)".

**HIGH — the homepage repeated them** ("How fit works": "from public
profiles", "count seniors who graduate before you arrive", "we add
academics and your preferences", "a band and a confidence level"; "Bands
and confidence"; the FAQ's "Public team rosters and UTR profiles").

**HIGH — "the real Today screen" showed an action /today cannot
produce** ("Skip the L5 on Nov 22 — 2 better events within 3 hours").
`lib/today-actions.ts` produces three kinds: email, follow-up, check-in.
The mock now shows exactly those, worded as the code words them.

**HIGH — "on a calendar your parents can see"** (homepage hero, OG and
Twitter descriptions). The training tables are own-row under RLS; a parent
cannot see the calendar. Now "with a family view your parents can follow".

**MEDIUM:** `/parents` "Plan the week — turn recruiting goals into a
training schedule that balances court work, match play, strength…"
(Seeded generates no plans); `/how-it-works` "Programs are compared by …
academics, conference and location" (only UTR bands; the rest are
filters); pricing's "Follow-up reminders" (reads as a notification —
Seeded sends none) → "Follow-up check-in dates (in the app)"; "Seeded
reminds you" → "flags on Today"; onboarding's "Sourced, dated rosters are
what we're building next" (a promise) removed; the dead
`NotificationsCard` (a Sunday digest and "come right away" alerts)
deleted rather than left one import away.

**Guards:** nine new phrase families in `lib/copy-honesty.test.ts`, and the
test's decoder now uses the shared normaliser, so `\u2019`, numeric
entities and `{" "}` joins are decoded too. Mutation-tested with three
disguised spellings of the removed claims; all fail the build.

---

## Found while building the harness (WS3, so far)

| sev | finding | fix |
|---|---|---|
| HIGH | Every signed-in page load upserted `user_settings` (DesignPreferenceSync's write-through started with an empty "last written" marker). 034 rate-limits that table, so after a busy hour a real theme change or training-preference save was refused "Too many changes at once" — the harness hit HTTP 500 / `53400` on every signed-in page | writes only when the person changes the theme, after the stored value is known |
| HIGH (SEO) | Public pages rendered no `<header>` until the session check: CLS **0.09** at 375 on `/`, `/contact`, `/methodology` (0.05 at 1440), and no nav links for a non-JS crawler | public nav rendered before hydration on public routes — CLS **0.000** re-measured |
| HIGH (SEO) | `/onboarding` and `/tournament-fit` server HTML was the nav and an empty main (`useSearchParams()` bail-out) | server-renderable Suspense fallback — 362 / 2,037 chars of real content now |
| MEDIUM | No favicon (`/favicon.ico` 404, no `<link rel="icon">`), no apple-touch-icon, no manifest | `app/icon.tsx`, `app/apple-icon.tsx`, `app/manifest.ts`, same mark as the OG image |
| MEDIUM | "Find the coaching staff" linked google.com/search (banned by the brief) on 3 surfaces | copyable search phrase, no link (`StaffDirectoryHint`) |
| MEDIUM | 20px "Forgot password?"; 16–20px "Update UTR", "Log check-in", "History" on /today; 12–13px "Switch to Legacy", "Report an error", school chips/selects | ≥24px targets (44 on mobile), 14px text |
| MEDIUM | `.eyebrow text-gold` failed AA contrast on /reset-password, /matches, /cost-calculator in Seeded | grass in Seeded |
| LOW | Academic tier "150+" shown for any rank over 100 | "Over 100" |

**Harness bugs, recorded so they are not repeated:** (1) sample school URLs
used raw slugs (`stanford`) — the catalogue appends `-m`, so every sample
404'd and looked like a broken site; slugs now come from the build's
prerendered list. (2) A signed-in persona's stored theme overrides
localStorage, so the first run's signed-in "dark" captures rendered light;
the harness now records the rendered `data-seeded-mode` and flags a
mismatch. (3) `/dev/*` correctly 404s in production; its own 404 document
was being counted as a console error. (4) A "server HTML is empty" check
that only looked inside `<main>` missed streamed Suspense content on
`/schools` and the school pages, which DO server-render.


---

## WS3 flows (3.5) — real journeys, production build, staging auth

`scripts/flows.mjs`; evidence in `~/seeded-evidence/overnight/flows/`.

| flow | result |
|---|---|
| wrong password | stays on /login with a sentence — was Supabase's raw "Invalid login credentials"; now "That email and password don't match an account…" |
| already signed in → /login | **was shown the sign-in form again**; now sent to /today (or /family for a parent) |
| under-13 (g): pending gate on /today; Settings reachable | ✅ |
| sibling PLAYER (a) offered "I'm their parent — give consent" for (g) | **❌ → fixed**: the button (which the server refuses) and "Approve and consent" now show only to a parent; a player is told to ask a parent |
| parent (f) grants consent through the UI → card disappears → (g) no longer gated | ✅ (DB: `consent_status` granted, `consent_granted_by` set) — (g) reset to pending afterwards for the harness |
| parent adds a $42 expense | ✅ listed; total $1,280 → $1,322 |
| JSON export as (a) | ✅ only (a)'s own user-keyed rows; 5 UTR entries; the family budget, as documented. CSV has no sibling/parent rows |
| 4th export in an hour (b) | ✅ friendly sentence (reworded from "a lot of changes" — it was a download) |
| `?checkout=success` | **❌ → fixed**: every failure said "Payment received … usually catches up within a few minutes" — including an account Whop has no membership for. Now three honest states |
| checkout start, 4 plans | ❌ locally, **by design of Whop**: it rejects an `http://localhost` return URL. The route took that URL from the request's Origin header (S-11) and turned Whop's 400 into an empty 500. Fixed: return URL pinned (production domain / preview's own https URL), Whop errors caught as a 502 sentence. **Must be re-checked on the HTTPS preview** — not verifiable locally |
| new signup (j) opens Settings to delete | **❌ → fixed**: an un-onboarded player was bounced from /settings to /onboarding, so export/delete required onboarding first |

**HIGH found on the way — the onboarding slider invented a UTR.** For a
player with no rating, the signed-in onboarding preselected **7.0**;
pressing Continue untouched saved 7.0 as their rating, wrote a "Starting
UTR" history entry, banded every school against it and put "My UTR is 7.0"
in the coach email — the exact placeholder CLAUDE.md warns about. The
rating is now an explicit choice (move the slider, or "I don't have a UTR
yet"); the pre-auth fit report's UTR box no longer pre-fills "7" and says
why when the button is pressed without a valid rating.

## RLS attack suite, re-run after tonight's changes (WS4)

Staging, every probe as `authenticated` with JWT claims, one transaction,
rolled back. `~/seeded-evidence/overnight/ws4/rls-suite.json`.

| # | attack | expected | result |
|---|---|---|---|
| 1–3 | player sets own `subscription_tier` / `role=parent` / `family_code` | 42501 | 42501 ×3 |
| 4 | player inserts a `parent_reports` row | 42501 | 42501 |
| 5 | player writes a "parent" note | 42501 | 42501 |
| 6 | player removes the account holder | 22023 | 22023 |
| 7 | `profiles` rows a member can read | 1 | 1 |
| 8–11 | stranger reads (a)'s UTR / matches / any budget / roster | 0 | 0 ×4 |
| 12–13 | stranger joins with a valid code; reads (a)'s UTR while pending | pending; 0 | pending; 0 |
| 14–15 | under-13 pending logs a UTR / rewrites birth_year | 42501 | 42501 ×2 |
| 16–17 | minor consents for self / sibling player consents | refused | `not_allowed` (self / not_a_parent_account) |
| 18 | direct `utr_entries` writes in an hour | 20 then refused | 20 then 53400 |

Plus the 14 parent read-only probes (WS1). Staging security advisors:
nothing new — no migration was written tonight.

---

# Previous pass

# Seeded — final pre-launch pass

Live log. Updated after every workstream so this is resumable: on resume,
read this plus `git log --oneline` and continue from the first unfinished
item. Never redo finished work.

**Branch:** `v1`. **Started from:** `30780d5`.
**Baseline before this pass:** 670 tests in 52 files; production build, both
modes: 0 axe violations, 0 console errors, header 1 row / 73px on 9 pages,
Lighthouse a11y 100 / SEO 100.

| Workstream | Status |
|---|---|
| A — fit report tells one true story | **DONE** (`00b972e`) |
| B — real-user walkthroughs (7 personas) | **DONE** |
| C — premium design detail pass | **DONE** (mobile targets in B; states/copy in D/F) |
| D — truth & honesty sweep | **DONE** (`0ed348c`) |
| E — regression safety | **DONE** |
| F — final independent verification | **DONE** — 1 CRITICAL + 6 HIGH found and fixed |

---

## A — the fit report must tell one true story

### A0. Reproducing the reported bug first

**Reproduced, exactly as reported.** `/onboarding` with Men's · UTR 8.7 ·
Class of 2031 computed its numbers three different ways from two parallel
band systems:

| surface | source | number |
|---|---|---|
| trajectory panel | `countBands` (lib/fit.ts) at the projected UTR | 0 today → 20 |
| headline + tabs | `countSchoolFits` (lib/school-fit.ts) at today's UTR | Reach 37 · Target 0 · Likely 0 |
| every row | `classifySchoolFit` at today's UTR | 8.7 vs the team range |

Each was correct about a different question. Nothing on the screen said they
were different questions.

### A1–A2. One rating, one report

- `recruitingTimeUtr()` is the only place that decides WHICH rating judges
  fit: projected to junior year before then, today's rating for juniors and
  seniors, `null` with no rating.
- `buildFitReport()` is the only place that turns a rating into bands. It
  returns counts, per-school rows, both views' totals and `bandBySlug`.
- `useFitReport()` is how every signed-in screen gets it, sharing the
  `utr-entries` SWR key so it costs nothing extra.

**Enforced by the type system, not a lint.** `classifySchoolFit` now takes a
branded `FitBasis` whose brand is a `unique symbol` private to
`school-fit.ts`. `classifySchoolFit(8.7, school)` does not compile. Making
the change surfaced **50 compile errors across 13 files** — every one a
place that had been choosing its own rating.

Migrated: onboarding fit report, homepage widget, /schools browser +
compare drawer, /today dashboard, parent family overview, outreach board,
school sort, today-actions.

### A3–A7

Segmented "By junior year | Today" toggle, shown only when the views
actually differ. Headline, secondary line, tab counts, row bands and the
trajectory line all read the same report. Per-row "Today: Reach → Junior
year: Target" when they differ, with a muted hollow marker for today's
rating on the range bar and a tooltip line naming it. "Estimate" chip and
the assumption sentence wherever a projection appears. Openings/Academics
columns removed — they were hardcoded "Not tracked" on every row. The save
card now asks for a first name and last initial, same nudge as /signup.

### Bugs this found that the brief did not list

1. **"in range" meant two different things.** The trajectory panel counted
   target+likely; I had defined it as reach+target+likely. A Reach is by
   definition a program you are not competitive for, so it is now
   target+likely everywhere, defined once.
2. **The Today view still said "By junior year…".** The headline keyed off
   whether a projection existed rather than the selected view — the same
   conflation, reintroduced by the toggle meant to fix it. Found by walking
   the persona, not by a test.
3. **Juniors' headline dropped Likely.** "realistic target for 10 programs"
   while the tabs said 10 Target + 2 Likely.
4. **Reach jumped 2 → 31 between views for persona (b).** The recruiting
   basis passed no projection, so every below-floor school fell through to
   Reach and the view lost the ability to tell Reach from Out-of-range.
   Fixed with a residual slow-pace curve to senior summer; persona (a) now
   reads 37 reaches today → 7 reaches, 12 targets, 8 likelies at junior
   year instead of "all my reaches vanished".
5. **Persona (e) hit a dead end** — a 4.0 beginner saw three tabs reading 0
   and no next step. Now an honest empty state naming the catalogue's limit
   and pointing at the tournament checker.

### A8 guards, all mutation-tested

`lib/fit-single-source.test.ts` — (a) for all five UTR personas in BOTH
views: headline == tab counts == rows rendered == trajectory total; (b) no
component may classify, count or mint a basis; (c) no rating → no bands.
Four mutations fail the build: recomputing the panel separately, banding
rows from one view while counting the other, a component classifying for
itself, and judging a pre-junior player on today's rating.

**Walkthrough result: all five UTR personas consistent in every view.**

| persona | junior-year view | today view |
|---|---|---|
| a Men's 8.7 C/2031 | R7 T12 L8 | R37 T0 L0 |
| b Women's 6.0 C/2029 | R0 T0 L0 | R2 T0 L0 |
| c Men's 11.0 C/2027 | — (junior: one view) | R0 T10 L2 |
| d Women's 9.4 C/2026 | — (senior: one view) | R0 T8 L2 |
| e Men's 4.0 C/2030 | R0 T0 L0 + empty state | same |

Tests 670 → 688. Typecheck, lint, build green.

---

## B — real-user walkthroughs

`scripts/persona-walk.mjs` drives each persona through the public journey on
a **production build** at 1440 and 375, light and dark — 8 screens × 4
combinations = 32 captures each, 160 in
`~/seeded-evidence/final-pass/`. It does not just screenshot: it reads the
numbers each screen claims and fails on contradictions, because a screenshot
cannot tell you the headline said 20 and the tabs said 12.

**Result: 80 problems → 0.**

### Two harness bugs found first, which is the point of checking the checker

1. **A 400 on every page.** `/onboarding`'s chunk 400'd everywhere. It was
   mine: I had rebuilt `.next` without restarting `next start`, so the
   running server served HTML referencing chunk hashes the rebuild had
   replaced. The same class of mistake as the blank-screenshot one — a
   harness reporting a fault it created.
2. **169 "tap targets under 44px" on /schools.** Almost all were links
   inside a sentence, which WCAG exempts because you cannot give a word in
   a paragraph a 44px box. Also counted `sr-only` inputs (1px by design)
   and 20px checkboxes sitting inside 44px labels.

### Real mobile findings, all fixed

| what | was | now |
|---|---|---|
| Header logo, every page | 28px | 44px |
| `/schools` compare checkbox | 13px | 20px box in a 44px label |
| `/schools` star + expand buttons | 28px | 44px (negative margin keeps row height) |
| `/schools` band chips, sort + filter selects | 32–34px | 44px on mobile |
| `/pricing` billing toggle | 40px | 44px |
| Footer link columns (6 public routes) | 20px | 44px on mobile |
| FAQ disclosure buttons | 26px | 44px |
| Tournament level buttons, sidebar nav | 40px | 44px |
| School page breadcrumb / "Report an error" / staff link | 20–26px | 44px |
| Range-bar track (carries the tooltip) | 10px | 50px via `::after`, layout untouched |

The star button needed the fix at the **call site**: the component asked for
`h-11 w-11` and the caller's `className="h-7 w-7"` won, because `cn()` is
tailwind-merge and the later class wins. Worth remembering — a component
cannot enforce its own minimum size against a caller.

The harness now measures a pseudo-element hit area rather than exempting
it, so the range bar is checked rather than excused.

**Still to walk: personas (f) parent-of-(a) and (g) under-13.** Both need a
session; see below.

### Personas (f) and (g) — signed in on staging

Staging passwords had been scrambled after the migration rehearsal, so I set
disposable bcrypt passwords on three clearly-fake staging accounts
(`fake-a-parent2@`, `fake-minor@`, `fake-a-player@`) to walk these. **They
are scrambled again at the end of this pass** — see the close-out checklist.

**(g) under-13, birth year 2016, `consent_status = 'pending'`.** `/today`,
`/plan`, `/settings` and `/onboarding` all render "A parent needs to say yes
first". `/schools` stays browsable with no bands, which matches what
`/privacy` says (the catalogue is public; the gate is on writes). The one
rough edge: the neutral-state prompt invites them to enter a UTR, and that
path leads back to the consent screen. Honest, slightly circular, logged as
P2 rather than fixed — the alternative is hiding a page they are allowed to
read.

**(f) parent of (a) — a real contradiction, now fixed.** `PARENT_NAV_LINKS`
sends a parent to `/schools`, and a parent has no UTR, so the page banded 37
programs against nothing: **"Not tracked" on every row**, the "Enter your
UTR to see your fit" prompt addressed to the wrong person, and the Overview
tab beside it saying "Bailey's recruiting". The one page a parent would open
to understand their child's options told them nothing about their child.

`/schools` now resolves the subject through the same
`resolveFamilyPlayerFacts()` the family overview uses, so the two screens
cannot disagree about who the player is:

| before | after |
|---|---|
| "Sorted by fit for you." | **"Sorted by fit for Bailey."** |
| Not tracked × 37 | Reach 0 · Target 2 · Likely 0 · Out of range 35 |
| caption "Team 12.3–14.9" | **"Bailey 9.4 · 12.3–14.9"** |
| "Enter your UTR to see your fit" | "Fit is shown for Bailey… this view is read-only" |

`hasUtr` (does the VIEWER have a rating) had to split from `hasFit` (is
there a fit to show) — gating on the viewer's rating gave a parent bands
with no marker and a prompt meant for a player.

| persona | screens | consistent? |
|---|---|---|
| f parent | /family, /family/budget, /family/weekly-reports, /schools, /events, /settings | ✅ all six about Bailey |
| g under-13 | /today, /plan, /settings, /onboarding | ✅ consent gate on all four |
| g under-13 | /schools | ✅ browsable, no bands (matches /privacy) |

---

## D — truth & honesty sweep

**Pricing checked feature by feature against `FEATURE_TIER` and the
migrations behind it.** Outreach and the plan at Player (024/019), the
parent dashboard, season budget and weekly report at Family, and the
catalogue, estimates, school pages, tournament checker and three saved
targets on Free — all accurate.

**One row was not.** "What-if school planner" was sold as Player-only and is
gated nowhere. It is client-side arithmetic over the public catalogue with
no database write for RLS to refuse, so the only possible gate is a
client-side one — and CLAUDE.md is explicit that `AuthGate`/`PaidGate` are
cosmetic and the database is the real control. **A paywall that cannot be
enforced is a claim, not a feature**, so the table now says free, which is
what it is. Recorded in `docs/DECISIONS.md`; the alternative (moving the
computation server-side) is a new feature on launch week.

**Two new phrase families in `lib/copy-honesty.test.ts`**, both
mutation-tested:

- *Forecast promises* — "you'll be 11.7", "we predict", "guaranteed
  results". UTR growth is a stated assumption with no data behind it
  (`lib/config/growth.ts` says so at length), so no surface may state a
  future rating as a prediction.
- *Delivery promises* — "we'll email", "straight to your inbox",
  "delivered every". Seeded sends nothing; the weekly family report is a
  page computed when you open it.

**A first draft of the forecast pattern fired on the honesty itself**:
`/methodology` says "there's **no guaranteed** turnaround", and a bare
`/guaranteed/` matched the denial of the thing it bans. A guard whose fix is
to delete an honest sentence is worse than no guard. Narrowed to actual
promises.

---

## E — regression safety

### Guard mutations from every previous round — all 8 still fail the build

| # | mutation | result |
|---|---|---|
| 1 | `judgingUtr` falls back to the raw `currentUTR` sentinel | 1 test fails |
| 2 | a component classifies bands for itself | 4 tests fail |
| 3 | hardcoded catalogue count written as "teams" | 1 test fails |
| 4 | "Weekly training plan" back on /pricing | 1 test fails |
| 5 | generator reached via an unscanned `lib/` helper | 1 test fails |
| 6 | banned copy planted in `/privacy`'s body | 2 tests fail |
| 7 | rows banded from a different view than the counts | 3 tests fail |
| 8 | pre-junior player judged on today's rating | 1 test fails |

Restored: 691/691.

### RLS attack suite, re-run on staging as real `authenticated` identities

Every probe ran inside a transaction that was rolled back; staging is
unchanged.

| attack | expected | result |
|---|---|---|
| Sibling **player** writes an encouragement note (033) | refuse | `42501` |
| Client writes `subscription_tier` (022/030/035) | refuse | `42501` "can only be changed by Seeded" |
| Under-13, consent pending, writes a UTR entry (030/031) | refuse | `42501` `account_active_required` |
| Stranger reads other families' data (027/037) | own row only | 1 profile, 0 utr, 0 matches, 0 notes, 0 budgets, 0 reports, 0 roster, NULL code |
| Family takeover via `profiles.family_code` (032) | refuse | `42501` |
| Account holder removed by a member (037/039) | refuse | `22023` |
| `parent_reports` client INSERT (039) | refuse | `42501` |

Structural: `delete_my_account` has exactly **one** overload taking **zero
arguments** (so it can only ever delete its caller), **20** rate-limit
triggers, **9** `stamp_family_code` triggers, **0** INSERT policies on
`parent_reports`, **21** RESTRICTIVE policies, and `family_account_holder`
is correctly **not** granted to `authenticated`. An approved member reads
exactly **1** `profiles` row; the roster returns **7 rows / 7 distinct / 1
holder**.

### Lighthouse (mobile), axe, console

**All ten pages a11y 100 / SEO 100 on the mobile form factor** — `/`,
`/pricing`, `/schools`, a school page, `/login`, `/signup`, `/onboarding`,
`/methodology`, `/privacy`, `/terms`.

**0 axe violations and 0 console errors** across 9 pages × 4 widths × 2
modes. The only filtered noise is Vercel Analytics and Speed Insights, whose
scripts are served by Vercel's edge and 404 against a local `next start` —
named explicitly in `scripts/ui-audit.mjs`, not silently dropped.

---

## F — final independent verification

**It found 1 CRITICAL and 6 HIGHs, and defeated 6 of 6 guard families.** Per
the outcome rules this means fix + re-verify + report, and **no PR**.

### C1 — a wrong number about a child, on the parent's weekly report

`/family/weekly-reports` told a parent their child's UTR had fallen **4.40
points this week**. The tile's value was the child's (9.40); its delta was
the newest row in a pooled list (the **parent's** own 5.00) minus the oldest
(the child's 9.40). Two different people, subtracted.

`loadUtrEntries()` was a bare `select` with no user filter, on reasoning
stated in a comment: *"utr_entries' RLS policy is exactly
`auth.uid() = user_id`, so there's nothing to gain from filtering
client-side"*. That was true when written and **migration 036 made it
false** — `utr_entries_select_family` lets approved members read each
other's rows, so the query silently began returning the whole family's
ratings. The same pooled list fed `useFitReport`'s projection input, so the
Reach/Out-of-range split on every row of a family member's `/schools` was
regressed over a mix of the family's ratings.

**RLS is a ceiling on what you MAY read, never a statement of what you MEANT
to read.** `loadUtrEntries()` now resolves the user and scopes the query;
reading someone else's history is a separate, named `loadUtrEntriesFor()`
that a caller must choose on purpose. Re-measured: **+0.20 this week**,
Bailey's own.

### The six HIGHs

| # | finding | fix |
|---|---|---|
| H2 | `/schools` judged every signed-in player on **today's** rating while `/today`, `/outreach` and `/family` projected to junior year — Workstream A's bug, one line below a comment denying it. `overrideUtr` was the slider's value, which equals the player's own rating when untouched, and `buildFitReport` treats any override as an explicit choice | pass the override only when `isAtRealCurrent` is false |
| H3 | A consent-pending under-13 was promised export and deletion and **could reach neither**. `AuthGate` redirected before the consent fetch landed; then `blockedForOnboarding` held them on a spinner for ever, because an account that can never finish onboarding was treated as mid-onboarding | wait for consent state; exempt the allowed paths from the onboarding block; point the consent screen's links at `/settings` (`/family` is blocked for every player by design) |
| H4 | The parent's own sidebar had an **Events** item that silently bounced to `/family` | removed — `/events` is the player's write surface |
| H5 | `/training` Templates still writes an invented week | **not changed — your decision stands** (see below) |
| H6 | `/onboarding` promised *"We'll tell you when a school changes band"*. Seeded has no email or push and nothing watches for band changes | copy corrected; guard widened |
| H7 | six guard families defeated | all nine mutations now fail the build |

### The guards: one systemic hole and five specific ones

**JSX escapes apostrophes.** The codebase writes `men&apos;s` and
`We&apos;ll` everywhere, and every pattern containing an apostrophe was
blind to the exact spelling the source uses. A hardcoded catalogue count and
an email promise both shipped past guards *written and widened specifically
to catch them*. `copy-honesty` now decodes entities before matching — one
change that closes two of the nine.

The rest: "will be 11.7" had no second verb; "confirmed with each program in
October 2026" matched no date spelling; the single-source guard asserted
`lib/fit.ts` but never the component wiring, so the headline could read one
view while the tabs read another; the training guard knew one identifier and
not the template path; the `profiles` detector keyed on a string literal and
missed a `const`; the band guard scanned one file, so a new component could
render a band and the old placeholder 7.

### H5 — your decision, left alone

You decided `buildTemplateSessions` stays: a player choosing a template is
choosing, and that is what manual means. The verifier is right that
Templates writes 5–7 Seeded-authored sessions in one click, and I have not
overridden you. What changed is the guard: a control that offers to fill the
calendar **for** the player now fails the build whatever it is called, so
the exemption cannot quietly widen.

### MEDIUMs fixed

Fit report showed 3 of 4 bands (tabs summed to 27 of 37; a junior saw 12 of
37) → Out-of-range tab added. A GPA of 3.5 was **invented** for a persona
who gives none → no default. `/schools` opened the men's catalogue for a
women's player and for her parent → browse side follows the profile, and a
parent's follows their child. "Gap to median" had opposite signs on the same
row. The parent's `/schools` still said "YOUR FIT" and "You 9.4". The
pricing comparison table said **nothing to a screen reader** — 12 rows of
unlabelled icons, at Lighthouse 100 and 0 axe violations, which is exactly
why those are a floor. The cost calculator attached **invented dollar
figures** to real school names.

`/privacy` and `/terms` claimed an under-13 "cannot change a setting" and
their account "does nothing". Measured on staging: they **can** edit name,
UTR, grad year, GPA and gender. Corrected — and the ability is right, since
locking a child out of their own data while they wait would be the wrong way
round.

### A fourth harness bug

`/pricing` reported horizontal scroll at 375. It does not scroll:
`documentElement.scrollWidth` reads 591 while `body.scrollWidth` is 375 and
`window.scrollTo(500,0)` leaves `scrollX` at 0 — inflated by the comparison
table's own `overflow-x-auto`, which is supposed to scroll inside itself.
Both harnesses now **try to scroll** instead of reading a number.

### After the fixes

**0 problems across 5 personas**, 0 axe violations and 0 console errors in
both modes, Lighthouse **mobile a11y 100 / SEO 100 on all ten pages**, **697
tests in 53 files**, nine mutations failing the build.

