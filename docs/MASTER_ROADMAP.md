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

**How to read this file (2026-11-20).** *Executive status* below is a
dated log, newest first — the top entry is current. **NEXT 10 TASKS** at the
very end is the current plan. Everything between them (scores, P0–P3 lists,
task tables) is the 2026-11-10 audit's task list with each item's outcome
marked inline; treat it as the record of how V1 was made safe, not as the
open list. Open items live in NEXT 10 and `docs/TODO.md`.

## Executive status

**2026-11-21 — The raw roster file is out of the repo (PR-ROSTER, Niran's
decision; no migration, no app change).** `docs/data/official_rosters_2026-27.tsv`
(one row per student, ~1,900 real names and hometowns) is replaced by
`docs/data/roster_counts_2026-27.tsv`: one row per team, counts per
graduating class and a total, no names/hometowns/notes. The owner keeps the
raw file outside the repo in `~/seeded-private/` (chmod 600); `.gitignore`
blocks `official_rosters_*` and `seeded-private/`. `scripts/aggregate-rosters.ts`
builds the aggregate and refuses to write unless the round trip is exact and
no personal value appears (any non-team cell, or a word of a player's name;
row-error reasons and odd class labels are redacted); the reader refuses
hand edits (missing or repeated row counts, impossible class years, totals
or labels that do not add up, junk in not-retrieved rows); the importer reads either format (same 179 teams,
10 not retrieved, 1,947 source rows; the generated report changed only its
file name). Guard `lib/catalog/roster-counts.test.ts` (strict reader, no
per-player header in any tracked .tsv/.csv, no tracked `official_rosters_*`;
mutation-tested); the raw file's tests run only where it exists. Git history
(from `f6b0ef1`) still holds the raw file, and `demo/reviewer-preview` still
has it until that branch is deleted — purge is an open owner decision (TODO).

**2026-11-21 — Migration 051 ON PRODUCTION (03:18 UTC, Niran's go; ledger
53).** Backup `~/seeded-backups/prod-20261120-2217-pre051.dump`; 0 pending
accounts at pre-flight; `probe-051.sql` identical on staging and production
(`~/seeded-evidence/review-ready/r17-051/`). Niran also decided (build after
the review, DECISIONS 2026-11-21): a player may approve only a family's
first parent, then only approved parents approve parents, with "approved
by" in Settings → Family; and the Whop re-check after checkout comes back
as a backup to the webhook. **Written 2026-11-20 (night), staging first:** The R9 sweep found a pending-consent under-13 could save target
schools: 030's own-row carve-out on `profiles` covered every column. 051 adds
a BEFORE UPDATE trigger refusing tennis/recruiting columns while
`account_active()` is false; probed on staging (refused 42501 for targets,
UTR and the upsert path; rename and unchanged re-save still allowed; active
players unaffected); rollback rehearsed. Guard
`lib/db/pending-consent-profile.test.ts`. GO-SEQUENCE row 26.

**2026-11-21 (Saturday) — docs/truth-pass (docs and comments only).**
Stale facts re-checked against evidence: test counts from a fresh run
(121 files / 1,816 tests); migration 048 is on production (empty, flag
off) in TECHNICAL_ARCHITECTURE; the `currentUTR` refactor is 139 uses in
38 non-test files, not "79 sites"; DECISIONS no longer claims `/dashboard`
keeps the checkout query (it drops it); DATA_QUALITY never says "Verified"
for a range (a range shows its source and date); next.config.mjs no longer says middleware
is the maintenance page (no middleware.ts exists), nor do MASTER_ROADMAP
and TODO; QA_CHECKLIST's test count is current. Recorded Niran's
decisions: keep GA with privacy guards (built in a separate PR), UI revamp now (screen by screen),
migration numbers at PR open, D-160–D-163 design system adopted.

**2026-11-20 (night) — Review-ready run: summary.** Merged to `main`, each
after CI `verify`, a Vercel Preview smoke test, an independent verifier
(no open HIGH) and the full local gate, then checked live (routes 200, 0
runtime errors, client on production Supabase): #13 migration 050
(parent-only budget, on production 23:20 UTC), #14 code quality, #15 docs,
#9 catalog phase 1 (048 on production 23:55 UTC; flag off), #16 visual
polish, #18 sweep fixes, #19 Legacy design deleted, plus this docs PR.
Production ledger 52. Open: #17 (migration 051, needs Niran's go). Tests:
119 files / 1,766. Report: `~/seeded-evidence/review-ready/REPORT.md`.


**2026-11-20 night — PR-LEGACY (`chore/delete-legacy-theme`; no
migration, no visual change to Seeded).** P1-UX-2 done: the opt-in Legacy
design is deleted — its home, pricing, settings, contact/terms/parents/
how-it-works, /today, /plan, /outreach, /family and tournament-fit branches,
its nav, sidebar and four-column footer, the nine `data-theme` palettes, the
palette picker and `ThemeProvider`, the Legacy/Seeded switch
(`DesignSystemId`, `html[data-design]`), the "Legacy theme" pill in Settings →
Appearance (now Light / Dark / Match system), two concept-theme fonts and 17
components reachable only from Legacy. `/dashboard`, `/roadmap`, `/coaches`,
`/cost-calculator` are server redirects (`/dashboard` keeps its query for
Whop's `?checkout=success`). A stored "legacy" choice — localStorage
`seeded.design` or `user_settings…design` — reads as Match system in code
(`lib/appearance.ts`); an optional cleanup migration is in TODO.
`lib/no-legacy-theme.test.ts` fails the build if any of it returns
(mutation-tested). Visual check: production builds of `main` and the branch
against staging, signed out / demo-player / demo-parent at 320, 375, 1440,
light and dark (102 pairs): 76 identical; the Settings → Profile pages differ only by the removed pill (54px shorter on phones); 8 pairs differ by a moving "now" (chart estimate slope, calendar time line). WebKit renders /, /pricing and /today. One pin: `html:root` keeps `--font-inter` / `--font-cormorant` as production paints them (merging the CSS chunks had flipped which rule won). Inventory and evidence:
`~/seeded-evidence/review-ready/r5-legacy/`.

**2026-11-20 night — PR-SWEEP (`fix/sweep-1`): eleven R9 QA-sweep findings fixed in the app.**
Settings → Profile refuses a blank name and a GPA outside 0–5 (DB CHECK, weighted GPAs allowed)
inline, `/api/profile` refuses both with a 400 sentence and answers any CHECK violation 400 not
500, and "Saved" shows only after a real 200 (H2/H3). The coach email never puts an email address
where the name goes — `[Your name]`, which keeps Copy/Gmail off. A consent-pending under-13 is
refused target-school adds/removes in the UI (H1, **UI half only — the database still accepts the
write from the account itself until the profiles migration lands**). Sign-in keeps `?next=`
(AuthGate and the head script; same-origin paths only, no auth pages) (M3). Also: focusable
"Collapse sidebar" visible on focus (M6), own metadata + canonical for /how-it-works, /parents,
/contact, /terms and the 404 (M7), no link-wrapped buttons (M9), "Follow up in 14 days" (L1, now
banned phrasing in copy-honesty), "1 coach emailed" (L8), disabled checklist boxes describe why
(L12). ⌘K focus return (L4) did not reproduce on this main — no change. Status per row:
`~/seeded-evidence/review-ready/r9-sweep/SWEEP.md`. No migration.

**2026-11-20 night — PR-POLISH (`fix/visual-polish`, NOT merged): low-risk
visual pass, presentation only.** No number, band or fit math changed; no
migration. (1) No entrance animations: AppShell's route fade-in is gone (the
keyed remount stays) and `Reveal`/`FadeIn` are plain `<div>`s, so nothing
server-renders at opacity 0 — `/` had 59 text nodes invisible until JS ran.
(2) /today: "UTR vs plan" moved into the main column (filled ~400px of empty
space at 1440; phone order unchanged), chart 278×150 → 714×220 with y-axis
and month ticks, a dashed estimate line (a logged-pace estimate has
low = high, so the shaded band drew nothing under a caption saying
"Shaded" — same fix, dotted, on /plan), and ONE data note with "About our
data" instead of a caption plus a second note. Body text 13–14px → 15px;
`DataNote` is 15px everywhere. (3) The slim footer sits in the app's content
column (`max-w-content container-px`) on app routes: left edge 272 → 289 at
1440 (= content), 24 → 20 at 375. (4) `formatTargetUtr` (lib/utils.ts): plan
checkpoints, the upside "Estimate" and "We plan with …" print at the nearest
0.05 (6.59 → 6.60); the final checkpoint IS the typed goal and prints as typed
(`formatCheckpointUtr`). Guard `lib/target-utr-format.test.ts`. Deviation to
review: Today.dc.html has the chart in the rail. Left alone: /events' cards
stay at their own heights (C22 chose that on purpose). Evidence:
`~/seeded-evidence/review-ready/r12-polish/`.

**2026-11-20 (night) — Migration 048 on production; PR E merging with the flag OFF.**
Backup, apply (23:55 UTC, ledger 51 → 52), fingerprint identical to staging, probed as real roles
(rolled back). No catalog data imported to production; `NEXT_PUBLIC_CATALOG_PHASE1_ENABLED`
unset in every Vercel environment. Review fix: the most recently ENTERED range is current, so a
wrong source date can be corrected. Follow-ups in docs/TODO.md (before the flag goes on).

**2026-11-20 (night) — PR-DOCS: the repo reads true for a first-time
reviewer.** README rewritten from the code and lockfile; new
`docs/REVIEWER_GUIDE.md` and `docs/README.md` (map); eleven dated reports
moved to `docs/archive/` with an index; HANDOFF §A–I archived (§J/§K stay);
CLAUDE.md gets a "Current state" block, the real branch flow (`v1` retired)
and its incident history moved below the rules; stale claims fixed across
the living docs; CI also runs the time-zone suite; PR template; `.nvmrc`;
`.gitignore` hardened. NEXT 10 rewritten for after the review.

**2026-11-20 night — PR-QUALITY (`chore/code-quality`; no
behaviour change, no migration).** Code-quality pass only. Zero `as any` left
in app/lib/components (three test stubs now `as unknown as
SupabaseClient<Database>`; the four Recharts tooltips use `TooltipProps`;
`mapProfileToPlayer` takes `Tables<"profiles">`). `eslint-disable`: 5 unused
ones removed (no-console ×4, no-control-regex), 1 fixed (tournament-fit
`blockers` memoised and listed), 9 kept with a same-line `--` reason.
`.eslintrc.json` gains `root: true`; `npm run lint` is `next lint
--max-warnings=0` and reports 0. npm scripts call `next`/`tsc`/`vitest`
directly (the `Coding:Projects` workaround is gone; README line dropped).
Dead code: 6 unused component files deleted (incl. the unused
`parent-login-form.tsx`, so its OPEN gradient allow-list entry in
`lib/design-system-v2.test.ts` is gone too), 8 dead data functions deleted
(notification/public-page prefs, `loadParentReports`, `uploadMatchVideo`,
`getSchoolsByGender`, `getTargetSchools`), 52 exports made module-private,
unused imports removed. `@axe-core/playwright` removed (zero imports).
`npm audit`: 24 → 23 (brace-expansion patch bump); `--omit=dev` reports 0 —
everything left is dev-only (vitest 1.x needs a major; lighthouse's
puppeteer chain has no non-breaking fix). `scripts/README.md` now gives a run
command and target for all 12 scripts. Report:
`~/seeded-evidence/review-ready/r6-quality/R6_REPORT.md`.

**2026-11-20 (night) — Migration 050 on production: the season budget is
parent-only.** `is_parent_member()` now requires the writer's own
`profiles.role = 'parent'` AND approved membership (033's pattern), closing
the known gap where a sibling player could write the budget. Staging
rehearsal (before/after + rollback), fresh backup, production 23:20 UTC
(ledger 50 → 51), probed as real roles in rolled-back blocks; production had
0 budget rows. Guard `lib/db/budget-parent-only.test.ts` (mutation-tested).
`/privacy` disclosure removed. PR-SEC. Evidence:
`~/seeded-evidence/review-ready/r4-rls/`.

**2026-11-20 — Rollout: 049 on production; PR #11 and docs PR #10 merged.**
Backup first, 049 in one transaction with its ledger row (production ledger
49 → 50, 2026-11-20 04:58 UTC), probed as real users before and after the
merge; post-deploy 0 stray 12s. PR #11 (`e099051`) deployed; 22 routes 200,
0 runtime errors. Report: `~/seeded-evidence/no-invented-goal/REPORT.md`.
The entry below was written before the run.

**2026-11-20 — PR E (#9): the real roster file imported to STAGING only;
not merged, nothing on production.** `docs/data/official_rosters_2026-27.tsv`
(1,947 rows, rosters read 2026-11-08): 0 row errors after fixing what the real
file broke (teams with no roster, a bare "2026" season, "Fr. '30" labels, a
roster with no class column, 18 teams already in the 68-program catalog under
longer names). 179 teams imported, 10 named in the file with no roster, 2 on
the conferences' own lists but absent (Saint Louis M/W; list with sources in
`docs/data/expected_programs_2026-27.tsv`). Staging verified by md5 against
the parser. No team ranges exist, so every imported team reads "Level not
rated yet" and none reaches a fit band; P1-DATA-1 now needs ranges entered at
`/admin/team-ranges`, starting from the 20 listed in
`docs/catalog/phase-1-import.md`. Flag off in production; 048 not there.

**2026-11-20 — fix/no-invented-goal (NOT merged; migration 049 on STAGING
only).** `profiles.tournaments_goal` was a hardcoded 12 for every account
(production 8/8 = 12/0). Migration **049** makes it nullable with no
default, clears every stored value, CHECK 0–60; `tournaments_played` is no
longer read or written (played is counted from `tournament_entries` marked
Played in the current season); a new `tournaments_planned_season` column
(same file) ties the count to the season it was set for, so last season's
plan shows as "Not set". The app calls it `tournamentsPlanned`
("Tournaments planned this season"): optional last diagnostic question
(players), Settings → Profile field, "Not set"/"Not tracked" everywhere
else — no default, no progress bar. A sweep for other invented numbers
removed the Legacy roadmap's `10 + i * 2` tournament counts, the Legacy
homepage's invented fit panel, unsourced milestone counts, the homepage
calculator's example values leaking into onboarding as answers, and
sign-up's pre-selected team/grade. Events calendar heading → "Schedule".
049 must be on production BEFORE this merges — GO-SEQUENCE §3c row 23,
HANDOFF §J Step 23. Guards: `lib/no-invented-goal.test.ts`,
`lib/tournaments-planned.test.ts`, `lib/home-calculator.test.ts`,
`lib/no-default-answers.test.ts`. Decisions: `docs/DECISIONS.md` 2026-11-20.

**2026-11-20 — Rollout: 046 + 047 on production; PR D (#8) merged.** Backup
first, then each migration in its own transaction with its ledger row
(production ledger 47 → 49), each probed as real users in a rolled-back
transaction — all passed, no residue; same result after the merge. Production
`leave_family()` matches staging byte-for-byte (comments/whitespace ignored).
PR D deployed (`dpl_7KYwcLwBUZLB1FB35YvHLQBsqcmG`), every public route 200,
0 runtime errors, signed-out app routes redirect to /login before JS. PR E
(#9, catalog phase 1) is open and NOT merged; its input roster file is
missing. Report: `~/seeded-evidence/fix-audit-2/REPORT.md`.

**2026-11-19 — PR D (fix/audit-2): the owner's signed-in production audit.**
D0 (owner-approved production cleanup: 3 test rows deleted, owner's
`current_utr` back to 5.80; JSON in `~/seeded-evidence/fix-audit-2/`).
D1 bands plan with min(own pace, 1.5/yr) (`PLANNING_PACE_CAP_PER_YEAR`),
upside shown, never banded; one pace number; no default goal. D2 signed-in
/onboarding (legacy flow + rating labels deleted). D3 coach email from sourced
parts, [brackets] block Copy/Gmail, "New email" fixed. D4 tournament
edit/remove/undo, Planning/Entered/Played, tournaments on the calendar. D5
verdict only from the draw average. D6 /settings/{profile,account,family,
billing,privacy}, Settings → Family (members, approve/decline, cap, leave).
D7 sweep. D8 perf: 10 serial auth round trips → 1, fonts 12 → 3 files,
signed-out app routes redirect before JS; signed-in content < 2 s
(`docs/archive/audit-2-perf.md`). Migrations **046** (`leave_family()`) and
**047** (status 'played') — GO-SEQUENCE §3c, HANDOFF §J Steps 21–22.
New guards: `lib/pace-cap.test.ts`, `lib/pace-honesty.test.ts`,
`lib/fit-pace-shapes.test.ts`, `lib/db/coach-email.test.ts`,
`lib/onboarding-legacy-removed.test.ts`, `lib/family-settings.test.ts`,
`lib/settings-sections.test.ts`, `lib/head-script-redirect.test.ts`,
`lib/supabase/authed-user-memo.test.ts`.

**2026-11-19 — Rollout: 041–045 on production; PR B (#6) merged.** Backup
first (pg_dump + JSON snapshot in `~/seeded-backups/`), then each migration in
its own transaction with its ledger row (production ledger 42 → 47), each
followed by GO-SEQUENCE's probe as real users in a rolled-back transaction —
all passed, nothing rolled back, no probe residue. 042 locked 5 families, of
which only NIRAN-0LK2 (the owner's test family) has more than one member.
PR B deployed (`dpl_E5AxjbACRiSmUGSBdydZ7RwC7mBZ`), every public route 200,
0 runtime errors. PR C (#7) merges next. Report:
`~/seeded-evidence/rollout-2026-11-19/REPORT.md`.

**2026-11-19 — PR B: migration 045, one Family plan = one family (owner's
decision).** A Family plan now unlocks only the payer's home family
(`home_family_code()`, the rule `my_family_code()` already used), and a family
holds at most 4 players and 2 parents — `join_family` returns `family_full`,
`approve_family_join` raises `family_full_<role>`, nobody is ever removed.
Probed on staging as real roles with two mutants that each let the refused
case through; rollback rehearsed. Production pre-flight (read-only): both
Family payers are at home, no family over a cap, so nobody's access changes on
the day. /pricing, the Family card, compare table, FAQ, paywall and /privacy
say "For one family: up to 4 players and 2 parents". Closes TODO "one plan
unlocks many families". HANDOFF §J Step 20; DECISIONS 2026-11-19.

**2026-11-18 — one-run build: PR B (#6) and PR C (#7) open, nothing merged,
nothing on production.** PR B: diagnostic onboarding (board 20), parent
dashboard (board 22), Family plan lock (042 + 044, RLS), billing page,
parent email verification (043), one projection rule shared by onboarding
and the app. PR C: production sweep C1–C30 — 29 fixed and proved by
`scripts/sweep-c.mjs`, C30 (Google end-to-end) blocked on enabling Google on
staging; catalog expansion plan (`docs/CATALOG_EXPANSION.md`). **Waiting on
Niran:** S1 (migrations 041–044 to production, GO-SEQUENCE §3b, backup
first), S2 (hide vs delete production's 28 generated workout sessions), comps
(one production parent, `025d6b77…`, will see the paywall), the nav "Tools"
group sign-off, "one Family plan unlocks many families", Supabase redirect
URL for `/auth/verified`, and Google on staging (C30).

**2026-11-18 — PR C verified by script, and the review's fixes (no
migrations, not pushed).** `scripts/sweep-c.mjs` checks C1–C30 against a
production build on staging as the sweep persona and writes
`~/seeded-evidence/production-sweep-1/SWEEP.md`: 28 fixed, C29 fixed, C30
blocked on a dashboard step (staging has no Google provider; the button and
the new-user → /auth/complete path are checked in code). The run found two
items not actually fixed and they are: /plan's Recent results said "vs
opponent 6.10" over a named opponent (C14) and its "Log a result" went to a
query nothing read (C2); the school page and /events stretched a short card
to its neighbour's height (C22). Phone sweep (320 + 375, player, Family
parent, free parent): 942 taps under 44px on 156 page loads → 0, no
sideways scroll, nothing under the tab bar; budget modals and the
delete-account dialog render on document.body like the other overlays.
Review fixes: /events shows every hand-added session (manual plan, the old
"My sessions" plan, or added a minute after its plan), not only the new
manual plan's; session-save errors are plain words; Legacy /today draws
the one projection and prints a chosen goal with two decimals; Legacy /plan
never prints a 0.00 goal; a goal at or below today's rating is rejected;
the native-dialog and local-date guards catch the bypasses the review found.
The nav Tools group was approved 2026-11-19. Still open:
the tab bar's 11px labels (mockup) and a ~0.07 CLS the harness sees on
phone /today that cls-sources.mjs cannot reproduce.

**2026-11-18 — PR C integrated (branch `fix/production-sweep-1`, on top of
PR B; not pushed, no migrations).** The three sweep branches (events/results/
check-ins/nav; numbers; tournament/outreach/schools/settings) are merged onto
PR B with PR B's rebuilt screens kept and each sweep fix re-applied to them.
One formatter per kind of number (`formatPlayerUtr` two decimals for a
logged rating, `formatUtrEstimate` one for projections and team numbers;
PR B's `formatUtr2` / `playerUtrText` and the sweep's local `utr2` /
`playerUtrText` helpers are gone) and one local-date parser
(`parseLocalDate` / `formatShortDate`; PR B's `localDateString` /
`localDate` / `shortLocalDate` and five hand-rolled `T00:00:00` copies are
gone). The parent chart draws `projectionPath(report.utr)`. /events'
Upcoming card no longer crashes for a player with no UTR and gives no verdict
for an entry saved without a fee.
**2026-11-18 — PR C, numbers (C5, C8–C12, C16, C19, C21, C24; no
migrations).** One projection: the school page's Pace row, both charts and
/plan's default goal all read the fit report's `utr` (`projectionPath`,
`resolvePlanGoal`, the report's `utr`), locked by
`lib/projection-single-source.test.ts`. A player's own rating always prints
with two decimals (`formatPlayerUtr`, lib/utils.ts — 5.95 was going to
coaches as "UTR 6.0"), guarded by `lib/player-utr-format.test.ts`.
Date-only values are local days (`toLocalDateString` / `parseLocalDate`,
lib/time.ts), guarded by `lib/local-dates.test.ts`; `npm run test:tz` runs
the suite under New York and Auckland. /plan's goal is the player's choice
(saved in `user_settings`) or the report's estimate — never the
hardest target's floor; Today shows the same pace warning. Today offers real
next steps instead of "all caught up" over "On track for 0 of 4". Decisions:
docs/DECISIONS.md 2026-11-18.
**2026-11-18 — PR C sweep, events/results/check-ins (branch
`worktree-agent-a12d20489df582ed0`, not pushed, no migrations).** The
calendar is manual-only in code: the /training planner, its generator and
templates, Match mode and `generatePrepPlan()` are deleted, `/training` and
`/match-mode` redirect, and the calendar reads only the player's manual plan
— production's 28 generated sessions are hidden, not deleted (**Niran to
decide** delete vs keep, DECISIONS 2026-11-18). Per-row
`/api/training/sessions` replaces the whole-state save that would have
deleted them. Week and Month render one date-keyed list. "Log a result"
opens the real result form; /matches rebuilt (labels, 44px, no gradients,
Seeded delete dialog + Undo); Today's check-in is one drawer with a
check-in history page; Results + Tournament checker are a "Tools" group;
overlays render in a portal (the check-in Save button was under the phone
tab bar). New guards: no-native-dialogs, plural, gradients, calendar one
source; training-no-autogen rewritten to "stays deleted".
**2026-11-18 — PR B (app side, in progress).** /family rebuilt to Board 22
(KPIs, UTR trend chart with the lib/fit.ts estimate, budget bars, recent
expenses, targets, "For you this week") and the Family paywall (B4) on the
three parent routes — the "Billing honesty" gap below closes once the
database half lands with it. Parent CLS cases from PR A addressed (one
skeleton per route at every loading stage; the school page hides player-only
controls for a remembered parent before hydration). Not yet measured with a
signed-in persona. /schools CLS for accounts with no fit (no-UTR player,
free-family parent, parent with no linked player) fixed by remembering the
page's last shape (DECISIONS, "remembered role"): 0.08–0.15 → ≤ 0.0003 on a
production build; a parent's first /schools load after sign-in can still shift.
**2026-11-18 — PR B, B6 screens + migration 044 (STAGING ONLY, branch
`b6-ui`).** 044: `family_members()` returns `current_utr`, `grade`,
`graduation_year`, `target_school_slugs`, `gender` as NULL unless the family
is on the Family plan (own row excepted) — the roster was a side door round
042's paywall. Rows and the approval/consent columns unchanged. Guarded by
`lib/db/family-roster-shape.test.ts` (structural, 8 mutants); HANDOFF §J
Step 19, GO-SEQUENCE §3b row 19. Parent /schools, /schools/[slug] and the
Settings linked-players card now say "shows with the Family plan" instead of
"hasn't logged a UTR yet" / "Class year not set" for a locked family
(`rosterStatsLocked()`), and `/privacy` says the five details need the plan.
B6 screens: the parent join step at sign-up (email + Google) treats
`verify_email_required` as a step ("Confirm your email to join your family",
Send the link, "I've confirmed — try again", code kept); /family's code
forms the same; the approval / consent card asks an unverified parent to
verify BEFORE the button and turns a 42501 into the same prompt; a
dismissible fixed-position banner for any unverified account (never on auth
pages or onboarding); `/auth/verified` finishes a remembered join and
bounces back to the stored path. Rules: `lib/email-verify-flow.ts`, tested in
`lib/email-verify-flow.test.ts`. Not verified end to end with a real inbox.
**2026-11-18 — PR B, database half (migrations 041–043; STAGING ONLY).**
041: `profiles.birth_month` (write-once, month + year only) and
`enrollment_term` for the diagnostic onboarding. 042: **the Family plan is
now enforced in RLS** — a family is unlocked when any member (parent or
player, either membership shape) is on Family; otherwise no member reads
another's rows and nobody reads/writes the budget, notes or reports
(restrictive `family_plan_required` on 10 tables; the roster and the
join/approve/consent RPCs stay open). This closes "the Family plan unlocks
nothing the code enforces" from PR A. 043: parents must prove their email
(a magic link; `email_confirmed_at` is useless because production
auto-confirms) before join/approve/consent — `42501 verify_email_required`;
players never. **043 was fixed the same day after a review broke it on
staging** (verify A by link → switch the auth email to B → mark again → B
counted as verified → under-13 consent): the proof is now bound to a
recorded request (`request_email_verification()`) for the current address,
the amr timestamp must follow it within the hour, and an email change blocks
verification for 24 h (`auth_email_changes`, via a trigger on `auth.users`).
The fixed 043 file is what production runs; staging got the delta as
`043b_fresh_email_verification`. Same review, also fixed in PR B: the
onboarding diagnostic's parent join silently dropped a
`verify_email_required` join; the banner (now parents only) claimed a
confirmed email was needed for password resets; `/api/profile` coerced an
absent `enrollmentTerm` to null and wiped the stored term; the no-math guard
missed aliased UTRs and `Math.*`; the paywall Example's budget didn't add
up; and `/auth/verified` would submit a pending join code stored by a
different account in the same browser. App contracts: `lib/db/family-plan.ts`,
`lib/db/email-verification.ts`, `/auth/verified`. Guard tests (mutation-
tested): `lib/db/family-plan-lock.test.ts`,
`lib/db/email-verification-gate.test.ts`, `lib/db/onboarding-fields.test.ts`.
Staging probes and pasteable rollbacks: HANDOFF §J Steps 16–18; order:
GO-SEQUENCE §3b. **Not on production; each needs Niran's go.** Personas:
`docs/STAGING_PERSONAS.md`.

**2026-11-16 — PR A `fix/ui-polish-1` (Design System v2, no migrations).**
Board 23's rules site-wide with guard tests (`lib/design-system-v2.test.ts`:
banned badge copy, raw hex, lime button fills, focus ring, primary-button
caps); one slim footer from AppShell on every route and Legacy only in
Settings → Appearance; one calm data note per card instead of chip stacks;
/pricing rebuilt to board 19 (table generated from FEATURE_TIER, cards gated
and tested); auth screens to board 21 with every error mapped (and a
`?authError=` text-injection closed); /schools hides the fit column until a
UTR exists and its CLS is fixed for players and parents (TODO #14 closed via a
remembered role); /today's nested buttons; pre-redesign styling on four
marketing pages. **Found, not fixed (Niran's call): the Family plan unlocks
nothing the code enforces** — see docs/TODO.md "Billing honesty". Evidence:
`~/seeded-evidence/ui-polish-1/` (before/after, BOARD-DIFFS.md).

**2026-11-16 — V1 IS LIVE.** On Niran's "go": backup to disk, then all 19
migrations applied to production in the rehearsed order (025, 022, 023,
026, 024, 027–039, then 040), each verified as a real user in rolled-back
transactions; production now has 42 migrations and matches staging 9/9
(function bodies differ only in comments). PR
niranramprasad-beep/seeded-tennis#4 merged (`main` @ `b16d85b`); the
maintenance page is gone, all 16 public routes + robots + sitemap return
200, security headers intact, the client reads production's Supabase.
**Found mid-run and fixed:** 024 refused every profile save for Free
accounts already over 3 schools (production had 2) — migration 040.
**Still Niran's (live checks needing real accounts/dashboards):** signup
confirmation email, Whop test webhook → 200, reconcile the paid bullis.org
membership, the $0 promo purchase, a parent's read-only view, and a
persona-(a) fit report signed in.

**2026-11-15 overnight "every pixel" pass (in progress — see
`docs/archive/FINAL_PASS_REPORT.md`).** A parent's Settings is now about the parent
and five player-data routes refuse parents; every family-readable loader
names its subject (the last pass's CRITICAL generalised: parent screens
pooled siblings' and parents' rows); the cost calculator's per-school
cost/aid guesses are gone; `/methodology` and the homepage stopped
describing a roster/confidence/players-leaving model the code does not
run; `/schools/[slug]` and `/plan` stopped banding pre-juniors on today's
rating; every signed-in page load no longer burns the `user_settings`
rate limit; public pages no longer shift 73px on load.

Seeded has a polished-looking UI, a real typed data layer, zod-validated
write routes, **660 passing unit tests in 51 files**, and a much more
careful RLS setup than most student projects. That's the good news.

**2026-11-15, launch UI polish (all 16 review items closed).** A premium
UI/UX + PM review of the `v1` preview found 16 issues; four of its P0s were
honesty bugs rather than cosmetics and are recorded in `docs/DECISIONS.md`:
`/schools` computed every fit band against the UTR-0 sentinel for
logged-out visitors ("Reach 37 · Target 0 · Likely 0", "You 0.0" on 37
rows); `/pricing` sold a "Weekly training plan" that the product
deliberately does not generate; `/pricing` told logged-out strangers Free
was their "Current plan"; and the program counts on `/pricing` and
`/schools` disagreed because neither said which gender it meant. The shared
header also wrapped to two rows at every desktop width — two `flex-1`
siblings splitting the row, not a space problem.

Measured after, against a **production build**, in **both light and dark**
(a first-time visitor follows their OS, so both are "the default"):
header **73px / 1 row** at 375 / 768 / 1024 / 1280 / 1440 on all 9 pages
with no horizontal overflow, **0 axe violations**, **0 console errors**,
Lighthouse **a11y 100 / SEO 100** on 7 pages, CTA contrast **14.24:1 light /
14.53:1 dark** (was 1.72:1). Evidence, including 72 before/after
screenshots and the machine-readable measurements, is in
`docs/screenshots/polish/` and reproducible with `node scripts/ui-audit.mjs`.

The bad news: **it is not launchable.** Of the three original reasons, the
first has changed shape and the other two are untouched because they need
decisions, not code.

1. **The core data was invented — now it's merely thin.** ~~Every school has
   a made-up head coach, email, recent recruits, conference rank and
   `example.com` URL.~~ Those six fields were deleted from the type and all
   68 entries (P0-3); the coach email no longer asserts anything the player
   didn't enter (P0-4); the marketing that dressed estimates up as verified
   data is gone (P0-7); and the fit bands now agree across every screen
   (P1-FIT-1/2). Four build-failing guards keep each of those from
   regressing, and each was confirmed to fail when its bug is reintroduced.
   **What remains is the real problem:** the roster UTR ranges still have no
   source or date. They're labelled "Unverified estimate" everywhere, but
   the bands, the Plan page and the email are still computed from them, and
   the catalog is 68 programs — a 5.81 player has **zero** schools in range.
   The product is now honest about its data; it just doesn't have enough of
   it. P1-DATA-1 is the single highest-value remaining task.
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

Everything else (UX bugs, SEO, CI, monitoring) is real but secondary — with
one exception worth promoting: there is still **no CI**, so the four honesty
guards added this session only protect the product if someone runs them.

## Current production-readiness score

**86 / 100** (31 at the 2026-11-10 audit; 52, 68 and 79 on 2026-11-14; 84 earlier on 2026-11-15)

Night 2 (2026-11-15) moved it from 79: production dependency vulnerabilities
are at zero (Next 15.5.29), rate limits are enforced by the database rather
than by our routes, two controls the product described but did not enforce
are now real (parent-only notes, required birth year), the rollout plan has
been rehearsed end to end and four defects in its rollbacks fixed, and the
launch pages went from 202 accessibility violations to zero with Lighthouse
accessibility and SEO at 100.

+2 on 2026-11-15 for migration 036: a parent can now read a joined player's
data, and — found while fixing it — a parent who joined with the code can now
write the two things parents are allowed to write, which they previously
could not do at all.

It is not higher because the two things that actually gate launch are
unchanged: **nothing is on production yet**, and the privacy policy still
needs an adult or a lawyer to review it.

Closed since: P0-3, P0-4, P0-6 (staging exists AND Preview/Development now
point at it), P0-7, P1-SEC-1, P1-SEC-5, P1-FIT-1, P1-FIT-2, P1-FIT-4,
P1-OPS-1 (CI + branch protection), P1-OPS-3 (migration drift), P1-SEC-2
(S-5), P1-SEC-4 (S-7), P1-SEC-6 (S-9), and P1-SEC-3 (S-6) in the half that
app code can reach.

**Everything database-side is written, applied and attack-tested on
staging, and none of it is on production.** **Eighteen** migrations are now
queued behind one word from Niran (025, 022, 023, 026, 024, 027, 028, 029,
030, 031, 032, 033, 034, 035, 036, 037, 038, 039). **036 does not ship without 037,
038 and 039**: an independent review found three defects in 036 within an hour of
it being written, two of which made a sentence 036 itself shipped in
`/privacy` untrue, and a third rehearsal found a fourth — the family roster
returned every double-linked member **twice** and called three removable
members "account holder" (038). **035 is not optional** — without it
032/033 break every profile write and 034 breaks account deletion for
everyone. **036 is the only step that widens what one user may read about
another**, and it is the one to read the rollback for first (§J step 13). P0-1, P0-2, P1-PRICE-1 and the P0-8 mechanisms
count as fixed only once they ship.

The whole sequence was **rehearsed end to end on 2026-11-15** against a
database rolled back to production's exact 23-migration shape and seeded
with prod-shaped data: 218 ms of database time, every pre-flight and verify
passing, and **seven** defects found and fixed in the ROLLBACK half of the plan — one
meant the highest-risk step's rollback had never been able to run at all,
and one broke every profile write in the app *while rolling back*. See `docs/HANDOFF.md` §J.

### Found Night 2, open, and not Claude's to close alone

- ✅ **A parent cannot read a JOINED player's data — CLOSED 2026-11-15 by
  migration 036**, on Niran's decision that an approved join is the player's
  opt-in. Membership has two storage shapes and only `my_family_code()` knew
  both; seven read policies required the owner's `profiles.family_code` to be
  non-null, which a joiner's never is. Fixing it surfaced a second half
  nobody had noticed: the nine tables that carry their own `family_code`
  column were stamped from that same NULL, so a joined player's matches and
  tournaments were unreadable by their own family **and a joined parent
  could not write the season budget or an encouragement note at all**.
  Attack-tested on staging in both directions — stranger, pending member,
  other family, removed member — plus the two write paths and the rollback.
  `docs/DECISIONS.md`, §J step 13.
- ~~Still open, deliberately not in 036: `is_parent_member()` grants
  season-budget writes to any approved joiner regardless of `role`.~~
  **Fixed by migration 050 (2026-11-20)**, mirroring 033's pattern.
- **`/sample-report` reports no First Contentful Paint**, so Lighthouse and
  PageSpeed score it 0 even though the page renders correctly. A measurement
  anomaly on a marketing page, with a bisect plan in `docs/TODO.md`.

What is genuinely left after the rollout is small and specific: a privacy
policy an adult has to write (P0-8's other half), two Supabase Auth
settings, and the product problem — P1-DATA-1.

| Area | Score | Why |
|---|---|---|
| Security | 8/10 | Both P0 authorization holes, the whole-row public profile read (S-5), rate limits on every write route (S-6), the RPC grant surface (S-9) and the under-13 gate are all fixed and attack-tested — **on staging only** at the time of this score (2026-11-15); all of it has been on production since 2026-11-16, when the maintenance page was also removed. Security headers (S-7) are in the code and verified against a production build. Four bugs found by the tests themselves (S-15, S-16, the dead birth-year field, the parent-first dead end). Not fixed: login/signup/reset rate limits, which app code cannot reach at all; nonce CSP |
| Data correctness | 5/10 | Fabricated coach/recruit/rank fields deleted and guarded (P0-3); the coach email states only player-entered facts (P0-4); fit bands now agree across every screen (P1-FIT-1/2). Roster UTR numbers are still unsourced estimates — labelled, but the catalog is 68 programs and a 5.81 player has zero in range (P1-DATA-1) |
| Core UX | 6/10 | Looks good, but several state bugs and theme flips |
| Reliability/Deploy | 9/10 | Staging exists and is a verified schema clone; Preview and Development read it, not production; CI runs typecheck/lint/tests/build on every PR and `verify` is a required check on `main`; production was then (2026-11-15) in a deliberate maintenance state, removed 2026-11-16, with a written, per-step rollback plan covering all eighteen migrations, **rehearsed end to end three times on 2026-11-15** (218 ms of SQL; **ten** plan defects found and fixed, every one by running the plan rather than reading it). The third rehearsal is the one that counts: it started from a staging database whose nine-category schema fingerprint matched production **9 of 9** and was seeded in production's real data shape, which is how it found a product bug (038) that no previous seed could expose. **The build no longer fetches fonts from Google** — self-hosted, three consecutive clean builds, CI retry removed. `.env.local` now points local dev at **staging** (verified 2026-11-15: the URL resolves to `gnlcpnsweqbtwpaqhqqg`, zero occurrences of the production ref). Still missing: error tracking |
| Legal/privacy | 7/10 | Deletion deletes (029). A complete JSON export exists, guarded by a test that fails the build when a new table is neither exported nor explicitly excluded. Under-13 accounts are inert until an adult in their family consents, enforced by RLS and not by the UI. Nothing about any user is visible to another signed-in user outside their family. `/privacy` now exists, every claim carries the file or migration that makes it true, and `lib/legal/policy.test.ts` fails the build when one stops being true. **Still open and not Claude's to close: a lawyer has to read it** — seven questions in TODO, headed by whether our consent mechanism satisfies COPPA's *verifiable* parental consent at all |
| Testing | 8/10 | 635 unit tests in 49 files pass, incl. **thirteen** build-failing guards (schools-catalog-honesty, copy-honesty, coach-email, fit-band-consistency, rate-limit buckets vs the SQL, the under-13 rule vs the SQL, export completeness vs the schema, family-UTR honesty, theme contrast, the UTR sentinel vs migration 006's CHECK, robots coverage, family-scope, every /privacy claim vs the code) — counted by listing the files on 2026-11-15, because this number had drifted twice and an independent review caught it both times. counted by listing the files on 2026-11-15, because this number had drifted twice. catalog, copy, coach email, fit-band agreement, rate-limit buckets vs the SQL, the under-13 rule vs the SQL, and export completeness vs the schema. The last three exist because each guards a rule written down in two places, which is the failure mode that does not announce itself. CI runs all of it on every PR. Still zero automated RLS/E2E tests: the 67 attack and happy-path checks behind P0-8 and S-5/6/9 this session, and the 30 behind P0-2 before it, were run by hand against staging |
| Observability | 1/10 | Vercel Analytics only; no error tracking, no alerts. Concretely: two real payments failed to upgrade anybody for six weeks and nothing surfaced it — it was found by reading the Whop dashboard by hand |

---

## Current P0 blockers (deployment blockers)

- [ ] **P0-1 Lock privileged `profiles` columns**

  Status: **APPLIED + ATTACK-TESTED ON STAGING (2026-11-14). Not on production.**
  Priority: P0
  Category: Security / Billing
  Staging result: 5/5. Self-upgrading `subscription_tier`, promoting to
  `role=parent`, setting own `family_code`, and repointing
  `whop_membership_id` are all rejected with `42501`; a normal `name` edit
  still succeeds. Production rollout + rollback: HANDOFF §J step 2.
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

  Status: **APPLIED + ATTACK-TESTED ON STAGING (2026-11-14). Not on production.**
  Priority: P0
  Category: Security / Privacy (minors)
  Written as `023_family_join_rpc.sql`. Staging result: 12/12 across the
  attack suite and the happy path — a stranger sees 0 families, a direct
  `parent_accounts` insert is rejected, `join_family()` on a valid code
  yields only `pending`, a pending link reads nothing, self-approval is
  rejected, brute force is blocked at attempt 6, and an APPROVED parent can
  read the child's UTR history while an unlinked stranger still cannot.
  Two real bugs were found and fixed in the process — see SECURITY_CHECKLIST
  S-15 (the rate limiter recorded nothing, because raising rolled back its
  own log) and S-16 (closing the hole also closed the legitimate
  parent-read path, since they were the same mechanism).
  **Code landed 2026-11-14** (migration 026 + `lib/auth.ts` rewrite + UI).
  All three `lib/auth.ts` breakages closed; `generateFamilyCode()` now uses
  `crypto.getRandomValues`. Approve/deny card on /today and /family, joiner
  waiting screen with Remind + Re-enter, declined and no-family states, and
  a roster with role/status/remove. End-to-end on staging: **30/30** across
  nine scenarios. **023 + 026 + the code ship as one unit.**
  Production rollout + rollback: HANDOFF §J steps 3 and 4b.
  Why this matters: `families` has policy `families readable` = `true` for all authenticated users (confirmed live). Any user can list every family code, set their own `profiles.family_code` + `role='parent'` (P0-1), or insert a `parent_accounts` row for any code (policy only checks `user_id = auth.uid()`). They then pass `is_family_member()` / `is_parent_member()` and can read that child's profile (incl. email, GPA, grade), UTR history, matches, outreach, check-ins, and write the family budget. Family codes are `FIRSTNAME-XXXX` with `Math.random()` — guessable even without the list.
  Dependencies: P0-1
  Affected files: `lib/auth.ts` (`generateFamilyCode`, parent signup, join flow), `components/auth/*parent*`, new migration `023_family_join_rpc.sql`
  Affected database objects: `families`, `family_codes`, `parent_accounts`, `profiles.family_code`, helper functions
  Security considerations: Replace direct writes with a `SECURITY DEFINER` RPC `join_family(code text)` that (a) looks up the code, (b) creates a *pending* parent link, (c) requires the player (or for under-13, the creating parent) to approve. Drop `families readable`; replace with members-only read. Generate codes with `crypto.getRandomValues`, ≥ 10 chars, no name prefix. Rate-limit join attempts.
  Testing required: RLS tests: stranger cannot list families, cannot read a family after guessing a code, cannot write budget; approved parent can.
  Acceptance criteria: Above tests pass; existing 6 families still work.
  Deployment impact: Changes parent signup UX. Needs prod code that uses the RPC before the old policies are dropped.
  Notes: REQUIRES ADULT REVIEW — this is minors' data.

- [x] **P0-3 Remove fabricated school/coach data from every user-facing surface**

  Status: COMPLETE (commit "P0-3: remove fabricated school and coach data from
  the product"; verified on localhost at 1440 and 390 + `/dev/outreach-preview`)
  What landed: `coachName`, `coachEmail`, `recruitingPageUrl`, `recentRecruits`,
  `programNote` and `conferenceRank` are gone from the `School` type and from all
  68 catalog entries (and the `Recruit` type is deleted) — not just hidden, so
  nothing can render them again. School detail's "Coaching staff" card now says
  "Not tracked" and links to a staff-directory **web search**
  (`staffDirectorySearchUrl`), never a guessed athletics URL. The outreach "To"
  field is a user-typed, validated input that starts empty, with the same
  directory link beside it; "Open in Gmail" is disabled until the address parses.
  Roster UTR numbers carry `UTR_RANGE_SOURCE_LABEL` ("Unverified estimate") on
  school detail, the Schools browser header and compare drawer, the Plan target
  list, and the Legacy stat tiles. `lib/db/schools-catalog-honesty.test.ts`
  fails the build on any re-add (allowlist-based, so unanticipated field names
  are caught too).
  Still open here: the *numbers* themselves are still unsourced estimates —
  P1-DATA-1 is the real fix. This task only stopped presenting them, and the
  invented coach/recruit data, as fact.

- [x] **P0-4 Rewrite the coach email draft so it only states things the player told us**

  Status: COMPLETE (commit "P0-4: the coach email only says what the player
  actually told us"; verified by unit tests + rendering both extremes — a
  brand-new account with nothing logged, and a fully-populated one)
  What landed: no coach name, no conference standing, no recruit footprint, no
  program blurb (those went with P0-3). Removed on top of that: the program's
  "competitive line" (an unverified estimate of ours, recited back to the coach
  whose roster it describes), "my roadmap has me closing that gap well before
  I'd arrive on campus", "I'll be at several events this spring and would be
  glad to play in front of your staff", and the "full sectional and national
  schedule" characterization used when the player had logged nothing. The UTR
  now travels labeled "(self-reported)" in the subject, body and signature.
  `WEAKNESS_PHRASES` were flattened from invented specifics ("turning my
  forehand into a genuine point-ending shot from the ad corner") to a plain
  rendering of the area the player actually ticked — that florid detail was
  invented data about the player, just harder to spot than an invented coach.
  Forward-looking statements now derive from `tournamentsGoal` and are omitted
  entirely when it's 0. (Superseded: D3 removed them, and 049 replaced
  `tournamentsGoal` with the player-entered `tournamentsPlanned`.) The "To" field work (empty, user-typed, validated,
  staff-directory link, Gmail gated) landed with P0-3.
  Tests: 8 cases in `lib/db/schools.test.ts` asserting the absence of each
  removed claim, plus the degenerate-input case (no orphaned punctuation or
  blank-line runs when every optional sentence drops out).
  Standing rule this leaves behind: every sentence `buildCoachEmail` emits must
  trace to a value the player entered, or to the school's name / division /
  conference. Nothing else. If a future change wants to say more about a
  program, it needs sourced data (P1-DATA-1) first, not better phrasing.

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

  Status: **MOSTLY DONE (2026-11-14) — staging exists; env wiring remains**
  Priority: P0
  Category: Deployment / Data safety
  Why this matters: Local dev, preview deploys, and production all use Supabase `tfpjssmhiptbwigarxpx`. A migration for an unmerged branch already broke prod (P0-5). Every local sign-in touches real users' data (this audit had to sign into a real account locally because no test project exists).
  What landed: the DB password reset fixed the tooling's own connection (no
  credential had to be copied anywhere). Verified the project was genuinely
  empty — 0 tables, 0 auth users, 0 storage, no migrations table — then
  applied all 23 of production's migrations **in production's real order**
  and confirmed a nine-category schema fingerprint matches prod exactly.
  Staging also holds three clearly-fake test users (`*@test.example`) and
  one family `TESTFAMILYA`, left as seed data.
  **Still to do:** point Vercel **Preview** and local **Development** at
  staging (Production stays put). Until that happens, local dev still reads
  real users' data — the original reason this was a P0. See TODO item 2.
  Note: staging is us-east-2, production us-west-1. Fine for correctness,
  not latency-identical.
  Dependencies: none — but it blocks P0-1 and P0-2, which must be applied to
  staging before production.
  Affected files: `.env.example`, Vercel env vars (Preview vs Production), `docs/DEPLOYMENT_CHECKLIST.md`
  Affected database objects: new Supabase project (or Supabase branching)
  Security considerations: Preview deployments must never get the prod service-role key.
  Testing required: confirm preview + local point at staging.
  Acceptance criteria: Production env vars exist only on Production; Preview + Development point at a staging project seeded with fake, clearly-labeled data.
  Deployment impact: High — env var reshuffle. Do it before any further migration.
  Notes: Use Supabase branching if the plan allows it; otherwise a free second project.

- [x] **P0-7 Remove every false claim from marketing and settings**

  Status: COMPLETE (commit "P0-7: remove claims the product can't back up";
  verified on localhost at 1440 and 390 by fetching `/`, `/pricing`,
  `/methodology`, `/sample-report`, `/schools`, `/settings` and asserting each
  removed phrase is absent from the served HTML)
  What landed, claim by claim:
  - "Rosters verified Oct 2026" → the `UTR_RANGE_SOURCE_LABEL` chip.
  - "Every team rating shows its source and date" → "Team ratings that are
    estimates are labelled as estimates."
  - "Rosters show source and date" (mobile hero) → "Estimates are labelled as
    estimates."
  - "A Sunday email with…" → "A weekly report you can open any time." The
    report is real (`/family/weekly-reports`); only the sending was fiction.
  - `/sample-report`: "Sent every Sunday to parents on the Family plan" → says
    plainly that Seeded doesn't email it. Its "Email settings" link (to the
    now-hidden notifications tab) is gone. "Verified Nov 3" → "Self-reported".
  - Settings → Notifications card **and** its left-nav tab hidden. Five
    toggles wrote real `user_settings` rows nothing ever read.
  - Settings → "Public recruiting page" toggle hidden. It claimed coaches
    could see results and video with parental approval; none of that exists,
    and the toggle wrote a real column, so a player could believe sharing was
    on (or off) when neither was true.
  - Delete account: "Removes everything within 30 days" → an accurate
    description of the only thing that happens (`deletion_requested_at` is
    set; a person actions it). Dialog and button copy likewise; the two-step
    confirmation stays.
  - Pricing: "Browse all D1 tennis programs" → "Browse 68 D1, D2 and D3
    programs" (real counts: 54/6/8, against ~1,100 real D1 programs).
  - Plan header "UTR · verified {date}" → "· self-reported {date}"; same on
    `/tournament-fit`. The `lastVerified` variable is renamed `lastLoggedUtr`
    so the next reader isn't misled by the code either.
  - Methodology: the three-level confidence model (keyed on a roster
    verification date that doesn't exist) now states where the data actually
    is. "We check reports within 48 hours and note the fix date" → no
    turnaround promise. Same for the homepage's "we fix it within 48 hours".
  - "compares you to real rosters" (hero, onboarding, and both pages'
    `metadata.description`) → "real programs". The schools are real; the
    roster numbers aren't sourced.
  - Homepage parent stat card labelled "Example", matching the Today mock.
  - Legacy: "Log a verified rating" → "Log your current rating".
  Dead code removed with it: the notification-prefs and public-page state in
  `seeded-settings-view.tsx` were fetching `user_settings` on every load for
  UI nobody renders. `lib/db/settings.ts` and `notifications-card.tsx` are
  deliberately left intact for when either feature is real (POST-V1).
  Guard: `lib/copy-honesty.test.ts` scans every shipped `.ts`/`.tsx` under
  `components/` and `app/` for all nine phrasings and fails the build.
  Comments may still quote the old copy (that's the documentation); only live
  code is checked. Confirmed the guard actually fires by reintroducing
  "Rosters verified Oct 2026" and watching it fail.
  Standing rule this leaves behind: a claim ships only once the code behind it
  does. Two of these ("Sunday email", "public recruiting page") were features
  someone intended to build, described in the present tense in the meantime —
  that's the failure mode to watch for, not deliberate overstatement. When one
  of them becomes real, delete its entry from `lib/copy-honesty.test.ts` in the
  same commit that makes it true, rather than rewording around the check.

- [ ] **P0-8 Minors' privacy, consent and deletion**

  Status: **MECHANISMS DONE + ATTACK-TESTED ON STAGING (2026-11-14). Not on
  production. The privacy POLICY is still open and REQUIRES LEGAL/ADULT
  REVIEW.**
  Built (migrations 029, 030, 031 + `v1` code):
  - **Real deletion.** `delete_my_account()` removes every row keyed on the
    account and the auth user itself. Takes no arguments — it reads
    `auth.uid()`, so it cannot delete anyone else by construction, which is
    why it needs no service-role client. The family is deleted only when the
    departing account was its LAST member, counted across BOTH shapes a
    membership takes (`profiles.family_code` and `parent_accounts`) —
    counting only the first would have deleted a parent-first family out
    from under the child. `season_budgets`/`budget_expenses` have no FK on
    `family_code`, so they are removed explicitly; everything else cascades.
    Staging: 17/17.
  - **Data export.** `GET /api/account/export` returns every row the caller
    owns plus the family budget, as JSON, read through the caller's own RLS.
    `lib/db/account-export.test.ts` fails the build if a table in the
    generated types is neither exported nor listed in
    `ACCOUNT_EXPORT_OMISSIONS` with a reason.
  - **Under-13 consent.** Birth year is stored (year only — a full DOB is a
    permanent identifier for a child, and the ambiguous year rounds TOWARD
    asking for consent). `consent_status` is derived by the trigger and
    never accepted from the request body; `birth_year` is write-once from
    the client, which is the load-bearing half (edit your birth year and the
    gate re-derives as `not_required`). A `pending` account reads and writes
    nothing but its own profile row, enforced by a RESTRICTIVE policy on 21
    tables rather than by the UI. An under-13 is offered no "create a
    family" path, because nobody in a family of one can consent. The adult
    approving the join records consent in the same action, under copy that
    says plainly that Seeded cannot verify adulthood. Staging: 24/24.
  - **Nothing about a minor is public by default.** 027 dropped the policy
    that made `privacy_level='public'` mean anything; new accounts record
    `private`.
  **Still open:** the privacy policy and terms. Mechanisms exist; the
  document that explains them to a parent, lists processors (Supabase,
  Vercel, Whop, Google Analytics) and states retention does not. Claude is
  not writing that.
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

- [x] **P1-SEC-1 Remove `/api/training/copilot` (Gemini)** — COMPLETE (commit
  "P1-SEC-1 + P1-SEC-5: delete the copilot and Stripe routes"). Deleted the
  route, `components/training/training-copilot.tsx`, and the
  `applyCopilotActions`/`resolveCopilotTypeId` handlers in `training-view.tsx`
  that turned model JSON into real create/update/delete on the player's
  sessions. `@google/genai` uninstalled; the AI key removed from
  `.env.example`. Verified: `POST /api/training/copilot` → 404, `/training`
  → 200, build 134 → 130 pages.
  **Still needs Niran:** delete the AI key from Vercel **and revoke it at
  Google**. An unused key in an env var is still a live credential.
  (Niran took this on 2026-11-11 and is doing it by hand.)
- [x] **P1-SEC-2 Restrict public-profile reads** — COMPLETE on staging (027).
  Dropped `profiles_discovery_read` outright rather than narrowing it: V1 has
  no public-profile surface at all, so "your own row, plus a family that has
  approved you" is the honest rule. Deliberately NOT replaced with a narrow
  view — a mechanism for a feature that does not exist, with no reader, that
  would trip the security-definer-view advisor. Same leak fixed one table
  over: `badges_read` exposed any badge row of any 'public' profile.
  Verified: stranger sees 1 profile (their own), 0 badges, 0 friendships, 0
  families; approved parent still reads the child, the family and the UTR
  history. Rollback: HANDOFF §J step 5.
  ~~ORIGINAL:~~ — `profiles_discovery_read` lets any authenticated user read the *whole row* (email, GPA, grade, family_code, stripe ids) of any profile with `privacy_level='public'` (1 such row live). Friends feature is gone, so drop the public/friends branches or expose a narrow view. Acceptance: SQL test as stranger returns no columns beyond name/grad year (or nothing).
- [~] **P1-SEC-3 Rate limiting + abuse controls** — the half app code can
  reach is COMPLETE on staging (028). Every write route consumes a
  Postgres-backed per-user, per-bucket hourly limit and returns a friendly
  429 with `Retry-After`. Postgres, not a module-scope Map, because Vercel
  runs many instances: an in-process counter multiplies every limit by the
  instance count. The limits live INSIDE the SQL function — a signature
  taking a `limit` argument would let the caller raise its own ceiling. Fails
  closed. `lib/rate-limit.test.ts` asserts the TypeScript bucket list matches
  the migration's CASE in both directions.
  **The other half is impossible from here:** login, signup and password
  reset go from the browser straight to Supabase Auth, so no Seeded route or
  middleware is ever on that path. Supabase's own per-IP limits and
  leaked-password protection are the only controls for them, and both are
  project settings (Niran).
  ~~ORIGINAL:~~ — none exist on any API route, signup, family join, or check-in. Add Vercel Firewall rate-limit rules (cheapest) for `/api/*` and auth. Enable Supabase leaked-password protection (advisor WARN, confirmed).
- [x] **P1-SEC-4 Security headers** — COMPLETE on `v1`, verified against a
  production build (`next build && next start`): all headers present, zero
  CSP violations across `/`, `/onboarding`, `/signup`, `/parent-signup`. CSP,
  HSTS (2 years + subdomains; `preload` deliberately NOT set — close to
  irreversible and an owner's call), `X-Frame-Options: DENY`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`. Enforcing, not report-only.
  **Partial on purpose:** `script-src` keeps `'unsafe-inline'`. Removing it
  needs per-request nonces, and nonces need a middleware.ts, which `main`
  does not have (the maintenance-page middleware was removed 2026-11-16). It still blocks every off-origin script host,
  which is the realistic attack. Nonce upgrade is P2 and is recorded as such
  rather than written up as done.
  ~~ORIGINAL:~~ — `next.config.mjs` sets none. Add CSP (start report-only), `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.
- [x] **P1-SEC-5 Remove dead billing surface** — COMPLETE (same commit).
  Deleted `/api/stripe/{checkout,portal,webhook}` and `lib/stripe.ts`;
  uninstalled the `stripe` package; removed the Stripe vars from
  `.env.example`. The `profiles.stripe_*` columns stay until a cleanup
  migration — no code reads them. Verified: `POST /api/stripe/checkout` → 404.
  **Still needs Niran:** delete the Stripe vars from Vercel and revoke the
  secret key in the Stripe dashboard.
  (Niran took this on 2026-11-11 and is doing it by hand.)
- [x] **P1-SEC-6** — COMPLETE on staging (027), with a finding worth keeping.
  Dropped `are_friends()`; revoked `current_family_code()` and
  `generate_family_code()` from `authenticated` (the latter let anyone probe
  the code space without touching 023's rate limiter). **The advisor's
  suggestion cannot be applied to the four helpers used inside RLS
  policies** — Postgres checks EXECUTE against the role running the query,
  so revoking fails the policy closed. Tested on staging, not reasoned
  about. Every remaining RPC is inventoried with who may call it and why in
  `docs/SECURITY_CHECKLIST.md`.
  ~~ORIGINAL: Revoke EXECUTE on helper functions from `authenticated` where RLS doesn't need direct RPC access** — advisor flags `are_friends`, `current_family_code`, `has_tier`, `is_family_member`, `is_parent_member` as callable via `/rest/v1/rpc/*`. Low impact (they only answer about the caller) but `is_family_member(code)` is an oracle for valid family codes until P0-2 lands. Drop `are_friends` entirely.
- [x] **P1-FIT-1 Fit bands disagree between screens** — COMPLETE (commit
  "P1-FIT-1 + P1-FIT-2: one fit band, and stop capturing a placeholder UTR").
  `whatIfProjectionFor()` now always returns a projection: real history for
  "My pace", and for "+1.5/yr"/"Custom" a synthetic straight line
  (`syntheticUtrHistoryFor`) that arrives at the hypothetical UTR on the
  senior-summer milestone, so `classifySchoolFit` can reach "out-of-range".
  The untouched panel passes the **real** projection — the same object every
  other screen passes — which makes cross-screen agreement structural rather
  than coincidental.
  Why `undefined` was wrong: it reads like abstaining, but `classifySchoolFit`
  answers "reach" for *every* below-floor school when it has no projection.
  So the "safe" option was silently making the most flattering claim about
  all 37 programs.
  Tests: `lib/fit-band-consistency.test.ts` (9) asserts classify/explain/count
  agree per school, that a hypothetical mode can still say out-of-range, that
  row bands equal the chip counters, and that a higher hypothetical never
  yields a worse band. Confirmed the suite fails (9 tests) when
  `whatIfProjectionFor` is reverted to returning `undefined`.
  Verified live at 1440 on `/schools`: untouched → Reach 37 and every row
  "Reach", matching `/schools/stanford-m`; "+1.5/yr" → 7.8 and Out of range
  37 with every row "Out of range"; custom 13.5 → Target 12 / Likely 25,
  counters summing to 37 and matching the rows; Reset → back to untouched.
- [x] **P1-FIT-2 Schools page shows the wrong UTR** — COMPLETE (same commit).
  `useWhatIfUtr` no longer seeds state from props. It stores only the
  player's explicit choice (`WhatIfOverride | null`); with no choice, the
  displayed UTR and mode are **derived** from current props, so they track
  the real player the moment it loads. That removes the whole class of bug
  rather than patching one instance — re-seeding from an effect would have
  lost the same race one tick later.
  Also fixed the second half: no pace button is highlighted until the player
  picks one (`activePaceMode`). Previously "+1.5/yr" rendered as selected
  next to a value that was just the current UTR — a pace nobody chose,
  attached to a number it didn't produce.
  The derivation was extracted to a pure `resolveWhatIfDisplay()` so it's
  testable without a DOM (the repo has no React testing setup and adding one
  wasn't justified for this). 5 tests cover it, including the exact
  regression: placeholder 7 → real 5.81 with no override.
  Verified live: `/dev/plan-preview` (a 9.42 player) shows "What if my UTR is
  9.4" and "You 9.4", not 7.0.
- [ ] **P1-FIT-3 Projection outputs are nonsense on noisy data** — Stanford page: "Pace: Projected 4.3 by Jun 1, 2028" for a 5.81 player; Plan chart band runs from ~6.2 down to ~2.0. One logged entry of ~7.0 between ~4.3 and ~5.6 dominates the regression. Fix: outlier rejection, floor projection at current UTR minus a small decay, show "not enough consistent data" instead of a falling forecast.
- [x] **P1-FIT-4 Pre-auth "Reach" is unbounded** — COMPLETE.
  `realisticPaceProjectionFor()` (lib/what-if-utr.ts) builds the synthetic
  line a visitor would be on improving at
  `REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max` to the summer before senior year,
  and both pre-auth screens — the homepage calculator and `/onboarding` —
  pass it. The MAX of the range, not the middle: "could I close this gap at
  all?" deserves the most generous realistic answer, so a school still
  marked out-of-range is one that stays out of reach on the best realistic
  trajectory. Verified live on a production build: a 3.0 men's visitor who
  previously saw "Reach 37 · Out of range 0" now sees 0 in every in-range
  band. Guarded by five new cases in `lib/fit-band-consistency.test.ts`.
  **It exposed a copy bug:** the fit-report footnote said "{total} programs
  for Men's in the catalog" using the in-band total, which was only ever
  equal to the catalog size because everything below the floor counted as
  Reach. It now reads the catalog length. ~~ORIGINAL:~~ — the homepage calculator and onboarding call `classifySchoolFit` without a projection, so a 3.0 UTR player sees Stanford as "Reach". Use a fixed realistic-pace cap (0.5–1.5/yr from `REALISTIC_UTR_IMPROVEMENT_PER_YEAR`) to mark Out of range.
  **Now the last place this pattern survives.** P1-FIT-1 removed the
  `undefined` projection everywhere else; `seeded-pre-auth-onboarding.tsx:44`
  is the remaining `classifySchoolFit(utr, s)` with no third argument.
  Visible today on a signed-out `/schools`: the placeholder 7.0 user gets
  "Reach 37 · Out of range 0" — internally consistent now (every screen
  agrees), but still too generous. `syntheticUtrHistoryFor()` from
  `lib/what-if-utr.ts` is the ready-made tool: feed it a realistic-pace
  target instead of a hypothetical one.
- [ ] **P1-DATA-1 Real roster import (migration 012)** — see DATA_QUALITY.md. This is the real fix for P0-3 and the single most valuable product task. Includes coverage below D1-elite: a 5.81 UTR player currently has **zero** schools in range (closest: Middlebury, 4.7 below avg). Without D2/D3/NAIA/JUCO coverage the product has no answer for most juniors.
- [ ] **P1-UX-1 Theme flips between pages** — Today and Plan render light, Schools/Outreach/Events/Settings render dark in the same session; Settings shows "Match system" selected while localStorage has `seeded.mode=light`; the sidebar toggle label switches between "Light mode" and "Dark mode". Fix the hydration order in `lib/context/design-context.tsx`.
- [x] **P1-UX-2 Remove Legacy from the product** — DONE 2026-11-20 (PR-LEGACY): deleted, routes kept as server redirects, `lib/no-legacy-theme.test.ts` guards it. Was: users can reach "Legacy theme" (Settings → Appearance) and "Switch to Legacy" (app footer). Legacy doubles every bug surface (two contact pages, two coach views, legacy `/dashboard`, `/training`, `/coaches`, the copilot). Freeze then delete for V1; keep redirects.
- [ ] **P1-UX-3 Mobile `/schools` table is clipped** — at 390px the "Your fit" column and badge are cut off with no scroll affordance. Make rows stack on mobile.
- [ ] **P1-UX-4 Mobile `/plan` pace warning collapses** — the warning text wraps to one word per line beside "Show realistic targets". Stack the button under the text below `sm`.
- [~] **P1-OPS-1 CI** — WORKFLOW COMMITTED, BRANCH PROTECTION STILL NEEDED.
  `.github/workflows/ci.yml` runs `npm ci` → typecheck → lint → tests →
  build on every PR into `main` or `v1`, and on every push to either.
  Single job named `verify`, so there is exactly one required status check to
  configure. Node pinned to 24 to match the Vercel project's runtime —
  CI passing on a different major than production builds on is a gap worth
  not having. Needs no secrets: verified `next build` completes with
  `.env.local` removed entirely.
  The build step retries up to 3× for the `next/font` flake (see the P2 item
  on self-hosting fonts); typecheck, lint and tests get one attempt each
  because they're deterministic.
  **Still needs Niran (GitHub settings, not a file):** Settings → Branches →
  add a rule for `main` → *Require a pull request before merging* + *Require
  status checks to pass* → select **`verify`**. Without that, the workflow
  reports but blocks nothing.
- [ ] **P1-OPS-2 Error tracking + uptime** — add Sentry (or Vercel's log drains + alerts) and an uptime check on `/` and `/api/health`.
- [x] **P1-OPS-3 Migration history drift** — RESOLVED 2026-11-14. Both live-only migrations accounted for: one recovered as a single real statement, the other shown to need no content (`rls_auto_enable` is a Supabase platform default, and `020` already does its revokes). Also uncovered a bigger problem — the repo did not reproduce production at all; see migration 025 and DATABASE_SPEC. Original note follows. ~~ — live history uses timestamps (`20261110205721_outreach_stages`, …) while the repo uses `011_…`; two live migrations (`rls_auto_enable_revoke_direct_grants`, `set_updated_at_revoke_authenticated_direct_grant`) exist only as comments inside `020`. Add them as real files and document the mapping in DATABASE_SPEC.md.
- [~] **P1-PRICE-1 Paywall placement** — CODE COMPLETE; MIGRATION APPLIED + TESTED ON STAGING (6/6: Free blocked from outreach, Player allowed, Free capped at 3 targets, Player unlimited, downgraded account can still prune). Not on production.
  Niran's decision (2026-11-11): **outreach belongs in Player ($19), not
  Family ($39); Free tracks 3 schools.** Outreach is the core recruiting
  loop — gating it at the top tier put the product's whole point behind the
  most expensive plan, while the tournament fit checker (already free and
  public) was advertised as a Family feature. Family is now genuinely about
  the parent side: read-only dashboard, season budget, weekly report.
  Prices unchanged ($0/$19/$39), so the Whop webhook's `TIER_PRICE_USD`
  needed no edit.
  Landed in code: `FEATURE_TIER` + `FREE_TIER_TARGET_SCHOOL_LIMIT` in
  `lib/types.ts` (one source the UI, the API route and the pricing table all
  read), `PaidGate required={FEATURE_TIER.outreach}`, a 403 with a real
  sentence in `/api/profile`, a star-button guard that explains the cap
  rather than letting the write fail, and rewritten pricing cards + matrix.
  9 tests in `lib/tier-gating.test.ts`.
  **Still open — needs the migration applied:**
  `024_tier_gating_outreach_player_free_targets.sql` moves the RLS policy to
  `has_tier('player')` and adds the Free-target trigger. Until it runs the
  gating is cosmetic: `profiles` is directly PATCHable via PostgREST, so the
  route check can be routed around (the P0-1 lesson), and `coach_outreach`
  still demands family tier. **Do not merge `v1` to `main` without it.**
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
- [ ] Pricing: the "Most popular" badge pushes its card ~7px lower than the others (now the Player card, after P1-PRICE-1); gradient headline text is off-palette.
- [ ] Pricing comparison table on mobile: the table is 640px inside a 350px `overflow-x-auto` wrapper at 390px, so only the Free column is visible and there is no scroll affordance — the other two columns look missing rather than scrollable. Confirmed 2026-11-11. `origin/macbook-backup` has a pre-redesign attempt at this (commit `7972882`) if it's useful.
- [ ] Schools row: chevron + checkbox + star = three tiny unlabeled controls; the compare checkbox is a near-invisible dark square.
- [ ] Settings placeholders "Bethesda, MD" and "3.7" look like real values.
- [ ] `/schools/cornell` 404s (real slugs are `cornell-m`/`cornell-w`); redirect bare slugs to the user's gender.
- [ ] School detail: layout shifts ~15px horizontally after load; footer starts 10px right of the sidebar edge.
- [ ] SEO: every school page has the same `<title>`; add `generateMetadata`. Sitemap lists legacy/redirecting `/cost-calculator`, `/how-it-works`, `/parents` and omits `/methodology`. See SEO_CHECKLIST.md.
- [x] `.env.example` drifted from the code (listed vars nothing read, omitted vars that were read). Fixed in the audit, and again on 2026-11-11 when the AI/Stripe names were removed with their routes. It is now the authoritative list: if a name isn't in it, no code path reads it. Keep it that way.
- [ ] `tsc --noEmit` fails on stale `.next/types/app/friends/page.ts`; exclude `.next/types` of deleted routes or `rm -rf .next` in CI.
- [ ] **Self-host the `next/font` Google fonts.** `next build` fetches them at build time and intermittently dies with `Cannot read properties of null (reading '1')`. Measured 2026-11-11: several failures and several successes across otherwise identical local runs, with and without env vars — a network flake, not a code fault. CI retries the build up to 3× to stop it producing random red builds (a required check that fails at random is one people learn to force-merge past). Self-hosting removes the build-time network dependency entirely; delete the retry in `.github/workflows/ci.yml` when it lands.
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
- ~~Legacy design system (delete, don't ship)~~ — deleted 2026-11-20 (PR-LEGACY)
- Stripe

## Deferred features
Everything in POST-V1 above. "Leaving" counts and "Data/verification" columns stay hidden until P1-DATA-1 provides real class years and verification dates.

---

## Architecture tasks
- [ ] P0-6 staging project. [x] P1-UX-2 delete Legacy (2026-11-20). [ ] P1-SEC-5 delete Stripe. [ ] Move the school catalog from TS files to Postgres (P1-DATA-1). [ ] Add `/api/health`.

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
- [x] **2026-11-15: measured.** Lighthouse mobile on a production build:
  performance 73–81, limited by LCP (5.1–6.0 s simulated, 4× CPU throttle).
  TBT 0–10 ms and CLS ≤ 0.09, so the pages are not janky — just slow to
  paint the largest element. Not optimised: a local `next start` is the
  wrong thing to tune against; measure the real deployment next.
- [ ] `/sample-report` reports no FCP at all, so Lighthouse scores it 0 —
  a measurement anomaly, not a broken page. Bisect plan in `docs/TODO.md`.
- [ ] The catalog still ships as a TS module to the client; after P1-DATA-1, page it from the DB. The catalog ships as a TS module to the client; after P1-DATA-1, page it from the DB. No other bottleneck was observed at current scale (8 profiles).

## Accessibility tasks
- [x] **2026-11-15: 202 axe violations → 0** across 10 pages at 375px and
  1440px, and Lighthouse mobile accessibility is 100 on every scoreable
  page. Fixed: the `--c-stone-light` contrast token (127 nodes), the
  `/schools` row's nested interactive controls (74), the unfocusable
  `/pricing` table scroller, and the footer's h4 headings (heading-order).
  332 focusable elements checked — all have a visible focus ring.
- [ ] Still open: FAQ and row-control touch targets ≥ 24px. [ ] Keyboard
  pass on the what-if slider and calendar drag (neither is on the 10 pages
  audited). [ ] Chart text alternatives (summary sentence already present —
  keep it).

## SEO tasks
- [x] **2026-11-15:** every public page now has a unique title, description
  and canonical (6 of 10 had no canonical; `/pricing`, `/schools` and all 68
  school pages shared the site-wide default title). Lighthouse SEO 100.
  robots.txt was disallowing the superseded routes (`/dashboard`,
  `/roadmap`, `/coaches`) while the live gated ones (`/today`, `/plan`,
  `/outreach`, `/events`) were crawlable — now derived from
  `lib/seo/private-routes.ts` with a test that walks the app directory. The
  sitemap was missing the privacy policy.
- See SEO_CHECKLIST.md for the rest.

## AI tasks
- [x] P1-SEC-1 — copilot removed. **V1 now ships no AI feature at all.**
- [ ] Any future AI feature must separate DATABASE FACTS from AI INTERPRETATION and pass every rule in CLAUDE.md (validated structured output, timeout, per-user rate limit, input cap, never another user's data, never an invented recruiting fact, labelled as AI interpretation, degrades when the provider is down). None of that existed in the copilot — that's why it's gone rather than patched.

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

Rewritten 2026-11-20 (night), for after the developer review on 2026-11-21.
The launch list this replaces (production rollout, PR B, PR D, 049, Legacy)
is done; it is in git history (`git log -p -- docs/MASTER_ROADMAP.md`).
Production runs every migration through 051 (ledger 53, 2026-11-21).

0. ~~Migration 051 (PR #17)~~ — DONE 2026-11-21 (on production, merged).
1. **Build the decided parent-approval rule** (Niran, 2026-11-21): a player
   may approve only a family's first parent; once an approved parent exists,
   only an approved parent approves another parent; Settings → Family shows
   who approved whom. One migration on `approve_family_join`, 033's pattern
   (docs/TODO.md "Who may approve a parent joiner"). Then the decided
   post-checkout Whop re-check (TODO "Post-checkout sync").
2. **Catalog team ranges from sources** (PR E #9 is phase 1, flag off):
   enter ranges by hand from official rosters in `/admin/team-ranges`, then
   turn the flag on. Every band still rests on labelled estimates until then.
3. **`Player.currentUTR: number | null`** — remove the `0` sentinel (139
   uses in 38 non-test files, re-measured 2026-11-21); `lib/utr-sentinel.test.ts` keeps it safe meanwhile.
4. **Full UI revamp** against the mockups (DESIGN_MOCKUP_SPEC*) — decided
   2026-11-21: now, one screen per PR (DECISIONS).
5. **AI goal coach** — a player's goals → year/month/week goals (Claude API).
   V1 ships no AI; this needs its own privacy-policy section first.
6. **Wire the recruiting checklist into Today.**
7. **Weekly email** — needs a real sending path (none exists; "Remind them"
   only re-sorts). Copy must not promise it before then.
8. **File splits**: `lib/fit.ts`, `lib/auth.ts`, the schools browser,
   `signup-flow.tsx`, the dashboard view (boundaries in REVIEWER_GUIDE §9).
9. **Public SEO school pages** once ranges are sourced.
10. **Observability** — no error tracking or alerting exists beyond Vercel
    runtime logs; the billing incident is what that looks like.

Still open from the R9 QA sweep after `fix/sweep-1` (row status in
`~/seeded-evidence/review-ready/r9-sweep/SWEEP.md`): H1's database half is
DONE (051, on production 2026-11-21; the sign-up INSERT is still uncovered —
TODO). Still open: M1, M2, M4, M5, M8, L2, L3, L5–L7,
L9–L11.

Niran's own list (dashboards/keys, not code): revoke the old Gemini and
Stripe keys; Supabase and Vercel Pro before taking real money (Auth rate
limits and leaked-password protection are plan settings); an adult/lawyer
review of the privacy policy.
