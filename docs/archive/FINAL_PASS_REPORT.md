# Seeded — overnight "every pixel" final pass (2026-11-15 → 16)

## HANDOFF — read this first

**`v1` @ `b3cf221`, pushed. Production untouched** (23 migrations, `main`
@ `d059006`, maintenance 503). Nothing was applied to production, nothing
merged to `main`; the only production contact was one read-only
`select 1` (OK).

### Five lines

1. A parent's Settings is about the parent, and "read-only" is enforced by
   every player-data API route (403) and attack-tested in the database.
2. Every screen bands schools from one report, projected to the summer
   before senior year, with one Reach rule (the player's logged pace) — the
   verifier's "same rating, two bands" is gone and pinned by a test.
3. No invented numbers: per-school cost/aid guesses, an onboarding UTR of
   7.0, and a tournament checker UTR of 8.0 are removed and guarded.
4. Walked on Chromium, **WebKit and Firefox**, 320 → 1920px, light/dark/OS
   sync/200% zoom/reduced motion: nothing clipped, layout shift 0 on every
   re-measured page but one (a parent's /schools on a phone, TODO #14).
5. An independent verifier found 4 HIGH + 9 guard bypasses; all HIGH are
   fixed and re-measured, every bypass now fails the build. 697 → 788 tests.

### Coverage

| pass | browsers | personas | viewports | themes | loads | result |
|---|---|---|---|---|---|---|
| tier 1 (every route from `app/`) | Chromium | a b c d e f g j + signed out | 375, 1440 | light, dark | 1,020 | 6 findings → fixed (`ff6b263`) |
| narrow (every route) | Chromium | all | 320, 375 | light | 510 | 2 clipped + 4 small targets → fixed (`75a4e95`) |
| browsers | **WebKit 18.2**, **Firefox 132** | a, f, signed out | 375, 1440 | light, dark | 168 + 168 | clean (after the localhost CSP note in `bf5bdd8`) |
| extras | Chromium | a, f, signed out | 1440 | Legacy, OS dark, 200% zoom, reduced motion | 108 | Seeded clean; Legacy fails (TODO #7) |
| flows | Chromium | a, f, g, j, new signup | 375 | light | — | pass incl. consent, budget, export, deletion 3/3; checkout START only to the request (Whop rejects an http return URL — TODO #8) |
| keyboard | Chromium | signed out, a | 1440 | light | — | skip link first, visible focus, dialogs trap/return |
| persona walk | Chromium | a–e | 375, 1440 | light, dark | — | 0 contradictions |
| Lighthouse | Chrome | signed out | mobile | — | 16 routes | below |
| RLS attack suite | staging SQL | 9 identities | — | — | 18 + 14 | as designed |

### Persona consistency (signed out, the fit report; headline = tabs = rows = panel)

| persona | view | Reach | Target | Likely | Out | note |
|---|---|---|---|---|---|---|
| a Men's 8.7, C/2031 | **By summer 2030: 12.2** | 13 | 12 | 12 | 0 | one typed number → the realistic-max pace splits Reach (P1-FIT-4) |
| a, signed in (5 logged ratings) | By summer 2030: 12.2 | 0 | 12 | 12 | 13 | logged pace 11.4 by June 2030; default = what-if 12.2, identical |
| b Women's 6.0, C/2029 | By summer 2028 | 2 | 0 | 0 | — | |
| c Men's 11.0, C/2027 | today (senior) | 0 | 10 | 2 | 25 | headline "in range for 12" |
| d Women's 9.4, C/2026 | today (senior) | 0 | 8 | 2 | — | |
| e Men's 4.0, C/2030 | By summer 2029 | 0 | 0 | 0 | — | honest empty state |

### Lighthouse (mobile, local production build), axe, CWV

| route | perf | a11y | BP | SEO | LCP (sim. slow 4G) | CLS | TBT |
|---|---|---|---|---|---|---|---|
| / | 80 | 100 | 96 | 100 | 5.3 s | 0 | 0 |
| /onboarding | 80 | 100 | 96 | 100 | 5.6 s | 0 | 0 |
| /pricing | 81 | 100 | 96 | 100 | 5.1 s | 0 | 0 |
| /schools | 79 | 100 | 96 | 100 | 5.6 s | 0 | 0 |
| /schools/stanford-m | 78 | 100 | 96 | 100 | 6.0 s | 0 | 1 ms |
| /tournament-fit | 81 | 100 | 96 | 100 | 5.3 s | 0 | 43 ms |
| /sample-report | 81 | 100 | 96 | 100 | 5.1 s | 0 | 0 |
| /how-it-works, /parents, /methodology, /contact, /privacy, /terms, /login, /signup, /schools/tcu-w | 78–81 | 100 | 96 | 100 | 5.1–6.1 s | 0 | 0 |

BP 96 is local `/_vercel/insights` 404s only. **axe:** tier 1 found two
(a 16px link target on /family, an unfocusable budget scroll region), both
fixed; the extras pass on the final code found **0 on the Seeded design**
(Legacy: contrast + 3 unlabelled selects, TODO #7). **CLS re-measured
after the fixes, ≤ 0.04 everywhere checked**: signed out on /, /today,
/outreach, /schools (0.000); a on /today, /outreach, /schools, /plan at
375 and 1440 (0.000); c on /schools and /plan at 320/375 (≤ 0.037); f on
/family (0.000) and /family/budget (0.019); every persona on
/schools/[slug] (0.000). Was 0.21 for a signed-in desktop user on public
routes and 0.16 for a signed-out visitor on app routes. Not fixed: a
parent's /schools on a phone (0.07–0.10, TODO #14). LCP is TODO #15.

### The PR

`docs/PR-v1-to-main.md` — **"Seeded V1: honest data, family privacy
enforced in the database, and the maintenance page removed"**. 99 commits,
440 files. Merge only after the 18 migrations are on production.

### GO sequence — `docs/archive/GO-SEQUENCE.md` (pasteable), in short

`chmod 600 ~/seeded-backup.env` first (it is world-readable). Then:
1. **Backup** — `pg_dump --format=custom` to `~/seeded-backups/`, then
   `pg_restore --list` must show table data for profiles, utr_entries,
   parent_accounts, families. Stop otherwise. (5 min)
2. **JSON snapshot** of profiles' privileged columns, parent_accounts,
   families. (2 min)
3. **Migrations in the rehearsed order** 025 → 022 → 023+026 → 024 → 027 →
   028 → 029 → **030 (stop: every profile `not_required`, 0 pending)** →
   031 → 032 → 033 → 034 → **035 (never skip)** → 036 → 037 (verify with
   `set local role authenticated`: exactly 1 profiles row) → 038 → 039.
   Each row has its verify, its STOP condition and its §J rollback block.
   218 ms of DB time in rehearsal; budget 45–60 min for reading results.
4. **Merge the PR** (green `verify`). Dry-run tonight: clean, no
   `middleware.ts`, 022–039 present. Re-dry-run if `main` moved.
5. **Vercel READY is not proof** — `curl` must return 200, not 503.
   Rollback: Vercel → previous deployment → Promote; DB changes do not roll
   back with it (§J step 15).

### Live checks after the deploy (20 min)

Public routes 200 · security headers present (CSP with
`upgrade-insecure-requests`, HSTS, frame-ancestors) · `/robots.txt` and
`/sitemap.xml` · a persona-(a)-shaped fit report reads "By summer 2030" and
headline = tabs = rows · a real signup's confirmation email arrives (Google
Workspace SMTP, support@seededtennis.com, 80/hour — set in Supabase Auth) ·
Whop test webhook → 200 · reconcile the paid bullis.org membership and see
`profiles.subscription_tier` = player · the $0 promo-code purchase end to
end · a parent's view is read-only (no star, no edit, 403 on a write).

### Week 1, ranked (`docs/TODO.md`)

1. **Parent dashboard upgrade.** 2. **Premium diagnostic onboarding.**
3. Role-gate the player tables' INSERT policies + `is_parent_member()`
role-aware (one migration). 4. (see 3). 5. Delete `generatePersonalizedPlan()`.
6. Onboarding's Grade/gender defaults. 7. Delete Legacy (it fails the
extras pass). 8. Verify checkout on the HTTPS preview. 9. Theme: account
vs device. 10. What `family_members()` returns while consent is pending.
11. Show the projection's ceiling. 12. Last-hours "Estimate" chip.
13. Dead `/family` entry in the consent allow-list. 14. A parent's
/schools shift on a phone. 15. LCP on slow 4G.

### Close-out done

All 11 staging accounts that still had a usable password (8 tonight's
personas + the previous pass's `fake-a-parent2@`, `fake-a-player@`,
`fake-minor@`) scrambled to a non-bcrypt string; **sign-in refused for all
11 through the real login form**. Persona (j) was deleted by the deletion
flow test. The password file, the scratch scripts and any saved session
are deleted; no JWT exists anywhere in the evidence folder. Typecheck,
lint, 788 tests, production build ×2 green at `b3cf221`; staging advisors
unchanged (21 intentional SECURITY DEFINER RPCs, 4 deny-all tables,
leaked-password protection off — a dashboard setting).

---

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
| 1 — parent profile fix + read-only made true | **DONE** — code, RLS attack suite, browser walk, verifier re-attack |
| 2 — no invented data | **DONE** (+ /tournament-fit's invented 8.0, found by WS8) |
| 3 — every page, every pixel | **DONE** — tier 1, narrow, WebKit, Firefox, extras, flows, keyboard |
| 4 — data scoping audit | **DONE** — guard now also checks where `subjectIds` and `family_code` come from |
| 5 — truth & claims sweep | **DONE** |
| 6 — a11y, performance, SEO | **DONE** — axe 0 and Lighthouse a11y 100 on Seeded; LCP logged (TODO #15) |
| 7 — security + privacy check | **DONE** |
| 8 — independent verifier | **DONE** — 4 HIGH fixed and re-measured, 9 guard bypasses closed |

---

## Queued decision (Niran, 2026-11-16): projection target = the summer before senior year

**Changed in one place.** `projectionTargetDate()` in `lib/fit.ts` is now
`summerBeforeSeniorYear()` (June 1 after junior year) — the milestone the
homepage, the what-if slider and every pace read already used, so the fit
report no longer contradicts the homepage's "by the summer before senior
year". Growth is applied over the real (fractional) time to that date:
a junior in November gets ~7 months, not zero; once that summer has begun,
today's rating is used. `RECRUITING_GRADE = 11` is gone (a guard fails the
build if `lib/fit.ts` names it again).

**Every label:** the toggle, headline, secondary line, panel, column
header, per-row "Today → By summer 2030", range-bar caption and tooltip,
the school page's chip ("by summer 2030 (est.)"), `/methodology` (twice),
the homepage's "How fit works". One shared `ProjectionNote` now appears
wherever bands come from the projection — the fit report, `/schools`,
`/schools/[slug]`, `/today`, `/plan`, a parent's `/family` — with the
assumption and the line **"Top D1 programs often decide earlier, during
junior year."** This also fixed a labelling gap: `/schools` printed the
projected rating as plain "You 11.7" for a player whose UTR is 8.7; it now
reads "You (est. summer 2030) 12.2".

**Persona table, re-measured on a production build** (`scripts/persona-walk.mjs`,
1440 + 375, light + dark — headline = tabs = rows = panel for every one):

| persona | projected view | today view |
|---|---|---|
| a Men's 8.7 C/2031 | **By summer 2030: 12.2** — R10 T12 L12 (OOR 3); panel 0 → 24 | R37 T0 L0 |
| b Women's 6.0 C/2029 | By summer 2028 — R2 T0 L0 | same (no toggle: the views do not differ) |
| c Men's 11.0 C/2027 | — (senior in 2026-27: that summer has passed; today's rating) | R0 T10 L2 |
| d Women's 9.4 C/2026 | — (graduating; today's rating) | R0 T8 L2 |
| e Men's 4.0 C/2030 | By summer 2029 — R0 T0 L0 + the honest empty state | same |

(Was, at junior year: a R7 T12 L8, judged at 11.7.) The brief's "(c) a
junior" is a senior by `getCurrentGrade()` for the 2026-27 school year.

**Guards:** `lib/fit.test.ts` rewritten to the new target (fractional years,
juniors projected to their coming summer, no growth once it has begun);
`lib/fit-single-source.test.ts` (e) pins `projectionTargetDate ===
summerBeforeSeniorYear` for six classes and a junior projected only to
June 2027; `copy-honesty` bans "by junior year" / "junior-year estimate".

## WS8 — independent verifier, and what it changed

A fresh agent, given the brief and none of this log, walked personas a, c,
e, f, g against the production build of `dc14ff0` (Chromium only — WebKit
was not usable, see below), attacked the parent read-only rule through
every API route and PostgREST inside `begin … rollback`, and tried to
defeat every guard with one realistic scratch edit each. It left git clean
and staging unchanged (checked). It found **4 HIGH, 7 MEDIUM, 4 LOW** and
**nine guards** a plausible edit got past.

### HIGH — all fixed in `6ac824e` / `e3632bd`, each re-measured on a fresh build

| # | finding | fix | re-measured |
|---|---|---|---|
| H1 | Same rating, same date, two bandings: persona (a)'s default view **Reach 10 · Out 3**; typing the identical 12.2 into the what-if **Reach 0 · Out 13**. `buildFitReport` grew the estimate another 1.5 years past the summer before senior year to decide Reach — a leftover of the junior-year target. | One rule in every view: the player's real logged pace at the summer before senior year, which is what `/methodology` already said (DECISIONS 2026-11-16). Regression test fails on the old code. | default and typed 12.2 both **R0 T12 L12 OOR13**; My pace 11.4 R0 T14 L5 OOR18; +1.5/yr 14.0 R0 T6 L31 |
| H2 | School page and `/schools` printed different gaps for the same school (Penn: −0.5 vs +3.0) — one used today's rating, one the projection, under the same label. | `fitGaps()` in lib; the school page's gaps, chip and range-bar marker use the band's rating, labelled "You (est. summer 2030) 12.2 … today 8.7". | Penn reads the same gap on both |
| H3 | `/schools/[slug]` at 375px laid out at 609px; the "Why this band" chip clipped everything right of it. | Chip drops under the description below `sm`; cards `min-w-0`; the range-bar tooltip (always laid out, `w-max`) capped to the viewport. | 375 / 375 for a and f |
| H4 | Parent `/family` at 375px laid out at 550px; **Remove** buttons off-screen. Grid tracks grew to the budget table's min-content. | `grid-cols-1` / `minmax(0,1fr)` tracks; budget page's calculator margin matched to the 20px mobile gutter. | /family 375, /family/budget 375 |

**Why the harness missed H3/H4:** it measured sideways overflow by trying
to scroll, and these pages clip instead of scrolling, so it read 0. It now
records every element past the right edge that no scroll container owns
(`clipped`), and a new `narrow` pass runs every route × persona at 320 and
375.

### MEDIUM / LOW

- **M1** the PR text claimed WebKit/Firefox coverage that had not run — true
  at the time. WebKit and Firefox are now installed (DECISIONS) and the
  `browsers` pass has run; the PR text states what actually ran.
- **M2** `/tournament-fit` invented **UTR 8.0** ("Your UTR 8.0 … you're at
  8.0") for anyone without a rating — shown to a parent as theirs. No
  rating → no verdict now; a parent sees their player's rating under the
  player's name, and "Copy a link to this check" instead of "Share with my
  coach".
- **M3** "Likely" was chipped "Above range" while the rating sat inside the
  drawn range → "At or above team average".
- **M4/M5** the what-if headline read "What if my UTR is **8.7** by June
  2030?" above "Bands use … **12.2**"; it now starts at the band's rating.
  A senior's read "by June 2026" (past) → "now"; the school page's pace row
  says "today" for a senior.
- **M6** parents can still INSERT player-table rows under their **own** id
  through PostgREST (never the child's — every write to the child's rows
  returned 0 rows / 42501). Already TODO week 1 #3; the PR says so.
- **M7** under-13 consent copy said the account "reads nothing" — it can
  read the catalog and `family_members()` (names, emails, ratings). Copy
  corrected; whether `family_members()` should return less while consent is
  pending is TODO week 1 #10 (a migration). The pending screen sent the
  parent to "Today"; parents land on Overview.
- **L1/L2** silent ceiling cap, last-hours "Estimate" chip → TODO #11–12.
- **L3** stale "junior-year" comments → updated.
- **L4** `/privacy` said a parent's export holds "the budget expenses you
  entered"; it holds the whole family budget → corrected.

### The nine guards — each slip reproduced as a probe file, now caught

`copy-honesty` + `no-invented-school-data` (the shared normaliser now reads
sentences across source lines and through JSX markup; tuition, average-aid,
per-year price and departures-count patterns added), `utr-sentinel` (any
file's raw `current_utr:`/`utr_entries` write; comments no longer satisfy
it), `dialog-a11y` (keys off `role="dialog"` too — keyed off `aria-modal`
alone it rewarded dropping it), `parent-read-only` (routes enumerated from
`app/api`; parent Settings cards allow-listed; one input), `fit-single-source`
(any component reference to `classifySchoolFit`/`countBands`/
`compareSchoolBands`, casts included), `data-scoping` (any quote style;
`subjectIds` must come from `subjectUserIds()`; `family_code` never from a
profile property), `nav-single-source` (any key order, literal links,
`.filter(…)[0]` and destructured pickers), `family-scope` (follows a query
across statements and through helpers). `scratchpad/probes.sh` wrote the
eight code probes, all eight failed the build, and the probes were deleted.

### What the verifier checked and found correct

Projection target edge cases (grad 2025–2031, July of junior summer); the
early-decision line on every projected screen and hidden for a senior; no
surviving "by junior year" copy; /today, /family and /schools agreeing for
(a); a parent sees no star or Save to targets, Settings has no player
field, every parent screen names Avery; all 5 player-data API routes 403 a
parent token; notes and expenses allowed, role change 42501, parent_reports
insert refused; every member reads exactly 1 own `profiles` row; no
privileged-column client write or cross-user profiles read in tonight's
diff; prices $99/$159 and the Free limit of 3 match the code; no console
errors but local `/_vercel/insights` 404s.

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

