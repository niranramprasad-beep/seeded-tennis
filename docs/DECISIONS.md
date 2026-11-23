# Decisions

Calls made without asking, because asking wasn't an option at the time.
Each one: what, why, and how to undo it.

Newest first.

---

## 2026-11-22 — School pages show the full roster by name and the coaching staff (Niran)
Niran chose, when asked, to show each school's official roster BY NAME
(class, singles UTR with its reliability, UTR profile link, hometown) and the
coaching staff with the emails the school publishes, from the owner's sheet
"College Tennis UTR Database". This reverses 048's "no player names". Rules
kept: official-roster players only; every rating links to the profile it was
read from; every staff row links to the official page it came from; emails
only where that page prints them; rosters are dated snapshots. Tables:
migration 054 (program_roster, program_staff). Still open: UTR licensing
(DATA_QUALITY), the privacy policy's mention of third-party names, and a
takedown path ("Report an error" mails support).

## 2026-11-22 (night) — The landing page sits on a hard court (Herdy's direction, Figma page 06)

Herdy asked for a tennis-themed landing page; the court-lines direction and a
full overhaul were chosen, mocked in the WD Figma file first and approved
("Go, build it"). Two calls made while building:

- **A fixed court colour, `--c-court` / `--c-court-text`.** Its value is light
  mode's own primary (31 107 74) with white, defined once in the base
  `:root` and NOT per theme — exactly like `--c-night`. Dark mode's primary is
  a light green with dark text, so a hero built on `bg-grass` would put white
  copy on light green in dark mode. White on the court measures 6.4:1; the
  90%-white small print 5.57:1. The palette gains no new colour.
- **The hero CTA is white with green text**, not the usual green button: green
  on the green court would vanish, and lime fills are banned by
  `design-system-v2.test.ts`.
- Undo: revert the landing commit; the court components are self-contained.

## 2026-11-22 — Clean deploys: every build warning we own is gone (`fix/herdy-vercel-warnings`)

Read from Vercel's build logs (production `main` 9c28391 and three previews)
and a local `next build`. Calls made without asking:
- **`engines.node` is `24.x`, not `>=24` (reverses the 2026-11-21 line
  below).** That line said "CI and Vercel run 24" — Vercel did not. An
  open-ended range overrides the project's Node setting (24.x) and Vercel was
  building production on **Node 26** while CI ran 24, with two warnings per
  build saying so. `24.x` matches `.nvmrc`, CI and the project setting. Cost:
  `npm install` on a local Node that is not 24 prints `EBADENGINE` (a
  warning, not an error) — use `.nvmrc`. Undo: set it back to `>=24`.
- **`next lint` → the ESLint CLI.** Next 15.5 deprecates `next lint` (Next 16
  removes it). ESLint 8 → 9 with a flat `eslint.config.mjs` (FlatCompat over
  `next/core-web-vitals`, same rule override); `.eslintrc.json` is deleted.
  `npm run lint` is `eslint . --max-warnings=0`, so CI's Lint step is
  unchanged and still fails on any warning. It now lints the whole repo
  (scripts/ and root configs too), not only app/components/lib; that found
  one unused `eslint-disable` (lib/ga-runtime.ts), removed. ESLint 10 is not
  possible until Next 16: eslint-config-next 15.5.x peers `eslint ^9`.
- **`app/opengraph-image.tsx` runs on Node, not edge.** The edge runtime made
  every build warn that it disables static generation; the image reads no
  request data, so it is now a static PNG rendered at build (checked: 1200×630).
- **`allowScripts` denies esbuild, fsevents and unrs-resolver install
  scripts.** npm 11 already blocks them by default and warned on every
  install; recording the denial keeps today's behaviour (each ships a
  prebuilt binary; the build and tests pass without the scripts) and stops
  the warning. Undo: `npm install-scripts approve <pkg>`.
- **`outputFileTracingRoot` is pinned to the repo directory.** A build from a
  nested `.claude/worktrees/…` checkout saw two lockfiles, warned, and
  traced from the parent checkout. On Vercel it is the directory Next picks
  anyway.
- **Not changed:** `npm audit` (23, all dev-only — production deps have 0);
  the non-breaking `npm audit fix` pulls a Sentry/OpenTelemetry tree in
  under `lighthouse`, and the rest need vitest 1 → 3+. Vercel's own
  `npm warn Unknown env config "cache-dir"` is the platform's, not ours.

---

## 2026-11-22 — Design polish round 1 departs from the Claude Design mockups (Niran's ask, Herdy's direction)

On the 22 Nov consult Niran said the UI "looks very overwhelming" and asked
for it to be polished. Herdy (Crimson web-dev expert) set the direction:
fewer words and pills, icons instead of some tags, a clear active nav state,
tinted feature cards, a pricing strikethrough, percent beside UTR changes,
initials tiles instead of school logos — and **the colour palette stays
exactly as it is**. The reference for this round is the Figma file
"WD — NiranRamprasad — Seeded" (https://www.figma.com/design/A6ACANVOvQOjUvA3lBeH5d),
not the Claude Design mockups, wherever the two differ.

- The percent now LEADS a change and the raw number sits beside it as
  smaller secondary text: "+7.1% (+0.50)" (Herdy's follow-up, same day). The
  raw number is never removed. One helper, `lib/utr-percent.ts`, and one
  component, `components/seeded/ui/change-figure.tsx`; no percent unless both
  values are real (no percent of the 0 sentinel, of a zero base, or of a flat
  line). Fit bands are still never a percent. Not changed: "0.3 below the
  team average" lines (a position against an estimated range, not a change)
  and pace rates ("+1.45 a year").
- Schools get an initials tile (`components/seeded/ui/school-monogram.tsx`),
  not a logo: no third-party marks, nothing that needs a source.
- Primary nav is unchanged (5 items + Tools; phone bar exactly 5).
- Undo: revert the `herdy-work` branch commits; no data or migration involved.

## 2026-11-21 (Saturday) — Niran's product decisions before the review (owner's calls, not Claude's)

Recorded as given in Niran's Saturday pre-review run brief. The D-/A- numbers
refer to Niran's own audit list, which is not in this repo.

- **Keep Google Analytics, with privacy guards (replaces D-158).** GA4 stays,
  and is to be made safe: the page path only (never the query string — the
  homepage calculator puts UTR, GPA, grad year and gender there), never on
  `/auth/*` or for an account that needs parental consent, no automated
  browsers or internal visits, and a server purchase event with plan and
  value only. **Not built when this was recorded:** on `main` at this commit
  `components/shared/google-analytics.tsx` still appends the query to
  `page_path`, so production still sends those calculator values to Google.
  The fix is the `fix/ga-privacy` PR; the privacy-policy wording goes to the
  lawyer as a proposal, not live.
  *Update, same day: built in PR #23 (`fix/ga-privacy`). One gap is not
  closable in code: GA4 "enhanced measurement" (history-change page views,
  outbound clicks, form interactions, site search) can still report the full
  URL until Niran turns it off in GA Admin, and the homepage calculator still
  puts its answers in the `/onboarding` URL (moving them out is a follow-up).*
- **The UI revamp happens now, screen by screen (replaces D-107 / D-212).**
  Not a big-bang rewrite: one screen per PR, each through the usual gate.
  Nothing of it ships today.
- **Migration numbers are assigned when a PR opens (D-210).** A branch
  drafting a migration does not claim a number; the number is fixed when its
  PR is opened, against what `main` and both ledgers already hold, so two
  branches never race for the same file name.
- **The D-160 – D-163 design system is adopted.** No code today; the revamp
  PRs build on it.

---

## 2026-11-21 — Niran's decisions on the review-ready report (owner's calls, not Claude's)

Recorded as given, in Niran's own current-turn sign-off.

- **051 ships.** Applied to production 2026-11-21 03:18 UTC after a backup
  and a real-role probe (HANDOFF §J Step 26); PR #17 merged after it.
- **Who may approve a parent — decided, build after the review.** A player
  may approve only the FIRST parent of a family. Once an approved parent
  exists, only an approved parent can approve another parent. Settings →
  Family shows who approved whom. *Accepted residual risk:* a player can
  still create a fake first parent with a second account; the "approved by"
  line is what makes that visible. *Why not stricter:* a family a player
  created has no parent to approve its first parent. Not implemented
  tonight. TODO "Who may approve a parent joiner".
- **Post-checkout sync comes back — decided, build after the review.** The
  Whop re-check after a successful checkout is turned back on as a backup to
  the webhook: idempotent, rate-limited, never downgrades. Not implemented
  tonight. TODO "Post-checkout sync".
- **The raw roster file leaves the repo (its own PR, same night).** `docs/data/official_rosters_2026-27.tsv`
  names ~1,900 real students; it is replaced by an aggregated file with no
  player names or hometowns, and the raw copy lives only on Niran's Mac
  (`~/seeded-private/`, gitignored pattern). Git history is NOT rewritten
  tonight (it needs a force-push and `main` is protected) — TODO.

---

## 2026-11-20 (night) — PR-LEGACY: the Legacy design is deleted

- **A stored "legacy" choice means "Match system".** Browsers (localStorage
  `seeded.design`) and accounts (`user_settings.notification_preferences
  .design`) that had picked Legacy get the Seeded design following the OS,
  read in one place (`lib/appearance.ts`, mirrored by the head script). Not
  "Dark" (Legacy's default was light), not their old `seededMode` (they had
  stopped using it). The browser key is removed on the next visit; the
  database key is dropped the next time the account chooses a mode, and is
  never written on page load (034's write budget). No migration — an
  optional cleanup one is in TODO. *Undo:* change `parseRemoteAppearance` /
  `resolveStoredSystemSync`.
- **`data-design` is gone, not frozen at "seeded".** The Seeded selectors
  are now `:root[data-seeded-mode="…"]`, `:root :focus-visible` and
  `:root [tabindex="-1"]:focus-visible` — the same specificity the
  `[data-design="seeded"]…` selectors had, so nothing in the cascade moves.
- **Legacy-only routes stay, as server redirects:** `/dashboard` → `/today`
  (*Corrected 2026-11-21: the query is **dropped**, not kept —
  `app/dashboard/page.tsx` redirects to a bare `/today`, deliberately, so
  `?checkout=success` never reaches CheckoutSync; see the post-checkout sync
  decision of 2026-11-21. This line used to say "query kept". The Whop
  checkout still returns to `/dashboard?checkout=success`.*), `/roadmap` → `/plan`, `/coaches` →
  `/outreach`, `/cost-calculator` → `/family`. The checkout return URL is
  untouched (billing; changing it is Niran's call).
- **Deleted because only Legacy reached them:** three recharts charts,
  `school-badge`, `school-marquee`, `fade-in`, `glow-orb`, `spotlight-card`,
  `parallax`, `magnetic`, `count-up-on-view`, `court-rule`, `slider`, the dev
  `TierSwitcher` (it lived in Legacy's sidebar), two fonts (Space Grotesk,
  IBM Plex Mono), `buildUtrChartSeries`/`buildUtrSummaryLine`,
  `countPlayedThisSeason`, `loadTournamentEntriesOrThrow`, `getConferences`/
  `getStates` and `seededCardLabel`. "Played this season" was shown only on
  the Legacy parent dashboard, so no screen shows it now.
- **Charts no longer follow a palette.** `useThemeColors` read Legacy's
  `data-theme`; the three charts that used it were Legacy-only and are gone.
- **The redirect routes lost their loading/error files.** A `loading.tsx`
  makes `redirect()` stream as a 200 plus a client-side hop; without it the
  four routes answer a real 307 (checked with curl on a production build).
- **`--font-inter` / `--font-cormorant` pinned with `html:root`.** On
  `main` the `:root` values (`"Inter", sans-serif`) beat next/font's class
  only because next/font's CSS sat in an earlier stylesheet chunk. Removing
  two fonts merged the chunks, flipped the winner and changed fallback
  glyphs (≈, →) and `<select>` text — found by the pixel diff. The pin keeps
  production's rendering. *Undo:* delete the `html:root` rule to adopt
  next/font's metric-adjusted fallback on purpose, in its own PR.

---

## 2026-11-20 (night) — Review-ready run: visual polish (PR-POLISH)

- **"UTR vs plan" moved from Today's right rail into the main column.** The
  run's brief asked for the width to be used and a larger, readable chart;
  in the rail it was 278×150 px with ~400 px of empty main column beside it.
  This departs from Today.dc.html (the mockup puts it in the rail) on
  purpose. Undo: move the card back into the rail in
  `seeded-dashboard-layout.tsx`; nothing else depends on its position.
- **Target numbers round to the nearest 0.05** through one formatter
  (`formatTargetUtr`, lib/utils.ts): checkpoints, the upside "Estimate",
  "We plan with …". Logged ratings and the player's own typed goal print as
  entered. The one-decimal planning estimate keeps `formatUtrEstimate`
  (DECISIONS 2026-11-18).
- **The estimate is drawn as a dashed line**, not a shaded band: its band had
  zero height (low = high), so the "Shaded" caption described nothing.
- **No entrance animations.** `Reveal`/`FadeIn` render plain elements and
  AppShell's route fade is gone (the keyed remount stays). Dialogs, drawers
  and menus keep their click-triggered motion.

---

## 2026-11-20 (night) — Review-ready run: docs, repo hygiene (PR-DOCS)

- **Archive, don't delete.** Eleven single-session reports moved to
  `docs/archive/` with `git mv` (history kept) and a one-line-per-file index.
  Root `REVAMP_REPORT.md`, `UI_AUDIT.md` and `SUPABASE_SETUP.md` went too;
  `SUPABASE_SETUP.md` was mostly wrong (OpenAI key, run 001–005 by hand), so
  its still-true parts are in the root README instead.
- **HANDOFF keeps §J and §K only.** §A–I were a 2026-11-10 snapshot (stack,
  routes, "known bugs: none") that nothing links to; they moved to
  `docs/archive/HANDOFF_HISTORY.md`. §J's anchors are unchanged, so
  GO-SEQUENCE's links still work.
- **CLAUDE.md: reordered, not rewritten.** Current state + branches first,
  then the rules, then the long incident notes under "Enforced invariants and
  their history". No rule was dropped; two stale lines were corrected (local
  dev now points at staging; the coach-field note after P0-3).
- **The README does not contain staging's publishable key.** It is public by
  design (every Preview deployment ships it), but the example env files stay
  placeholder-only (R7 checks they hold no value over 20 characters), and a
  reviewer gets it from the maintainer. Typecheck, lint, tests and the build
  need no env at all, which the README says.
- **`engines.node` is `>=24`, `.nvmrc` is 24.** CI and Vercel run 24; an
  upper bound would warn on newer local Node for no benefit.
  *Reversed 2026-11-22: Vercel was in fact building on Node 26 because of the
  open range — `engines.node` is now `24.x` (entry above).*
- **CI also runs `npm run test:tz`** and triggers only on `main` (`v1` is
  retired). One job, so branch protection's required check (`verify`) is
  unchanged.
- **Eight remote branches already merged into `main` were deleted** (list in
  `~/seeded-evidence/review-ready/r11-repo/branches.md`). Kept: `main`, `v1`
  (has commits not on `main`; archive of the launch line), `macbook-backup`
  (archive) and PR E's branch.

---

## 2026-11-20 (night) — Review-ready run: migration 050, budget writes parent-only

Calls made without asking (the owner was asleep; the run was pre-approved for
this migration):
- **Fix the function, not the six policies.** `is_parent_member()` is used by
  exactly six policies, all budget writes, and by no function (checked on
  production). Narrowing it is the smallest change and the one place a future
  reader looks. Undo: §J Step 24 rollback.
- **Budget writes do not need 043's email proof.** 043 guards actions that
  change who is in a family or consent on a minor's behalf (join, approve,
  under-13 consent). A budget write changes neither, is visible to the whole
  family, and every approved joiner parent already proved their email to join.
  Requiring it would refuse an approved creator-parent who has never been
  asked to verify, for no gain in what anyone can see. Revisit if the budget
  ever carries payment details.
- **The Family-plan lock stays a separate RESTRICTIVE policy** (042/045), not
  folded into the function. Two gates that are each testable beat one that
  does both.
- **Production had 0 budget rows**, so there were no non-parent rows to report
  and nothing was changed.
- **The /privacy disclosure was deleted, not reworded**, in the same commit
  (TODO's instruction), and the effective date moved to 2026-11-20.

---

## 2026-11-20 — fix/no-invented-goal: no invented tournament goal (migration 049) and the numbers sweep

Calls made without asking (the owner was unreachable):
- **Every stored `tournaments_goal` is set to NULL**, not only the 12s. All
  of them are 12 (production 8/8, staging 32/32), and no screen ever let
  anyone choose a value, so there is nothing real to keep. Undo: 049's
  rollback (which re-invents 12 — it says so).
- **The column keeps its name** (`tournaments_goal`); only the app renames it
  (`Player.tournamentsPlanned`, label "Tournaments planned this season").
  Renaming the column would touch the export, the types and every rollback
  for no user-visible gain.
- **`tournaments_played` is kept, not dropped**, and no longer read or
  written. Dropping it is a separate cleanup (TODO).
- **CHECK 0–60.** A sanity ceiling, not a target.
- **The count carries its season** (`profiles.tournaments_planned_season`,
  review M2, in the same 049 file): stamped with `seasonKey()` when the
  player sets it, NULL when cleared; a count for any other season shows as
  "Not set" (player) / "Not tracked" (parent). No pairing CHECK, so the old
  app's seasonless 12 in the deploy window is accepted (and shows Not set);
  HANDOFF §J Step 23's post-deploy verify re-clears those.
- **Parents are not asked team or grade at email sign-up** (review L2); every
  sign-up path writes the shared `PARENT_ROW_GENDER` ("male") /
  `PARENT_ROW_GRADE` (10) to a parent's own row, which no screen shows.
  Google sign-up used "female" before; now the same as the others.
- **The diagnostic's "Question N of M" follows the role** (10 for a player,
  9 for a parent). The phone homepage calculator says "Example values.
  Change them to yours." The legacy parent dashboard's played count shows a
  skeleton while loading and "Not tracked" if the read fails (a throwing
  loader, `loadTournamentEntriesOrThrow`), never a 0 nobody measured.
- **"This season" = the app's existing season** (`currentSeason()`: fall
  Aug–Nov, winter Dec–Feb, spring Mar–May, summer Jun–Jul). New
  `seasonKey()` makes winter one season across the new year. Played this
  season = the player's `tournament_entries` with status 'played' whose
  `event_date` falls in that season.
- **The diagnostic gains a tenth question** (optional, last, players only).
  Board 20 shows nine — this is a deliberate departure from the mockup,
  flagged here. A parent is not asked: their answers are never saved to a
  profile, so it would collect a number that goes nowhere. "Question N of
  10" for a player; a parent's last question is 9. Skipping leaves it NULL.
- **Settings → Profile gains the field** (players only; blank = Not set).
  The mockup's Player profile card has six fields; this is a seventh.
- **A parent sees "Not tracked" for the planned count, not "Not set".**
  The brief said "Not set", but a parent cannot read it: `family_members()`
  (037) returns an enumerated column list that excludes it, so "Not set"
  could be false. The card says the player sets it in Settings and that it
  isn't shared to the family view. Widening `family_members()` is a
  security-surface change and was not made (TODO).
- **The coach email still does not state the planned count** (D3 stands);
  copy-honesty's patterns stay, their reasons updated.
- **The cost calculator no longer pre-fills tournaments per year** from the
  planned count: "this season" is not "per year". Years remaining comes from
  the PLAYER's real class year (the family budget passes the family
  player's); a parent's own row is never used. Empty inputs show "Not set".
- **API compatibility:** `tournamentsPlanned` is optional in the profile
  schema; absent = leave the stored value alone. A client built before 049
  posts `tournamentsGoal: 12`, which the schema strips, so it can never write
  the 12 back. Sign-up sends no `tournaments_goal` at all (so if the app ever
  deploys before 049, sign-up still works; it would store the old default 12,
  which is why 049 must run first).
- **The numbers sweep** (table in the PR report): removed the Legacy
  roadmap's per-year "N tournaments" (`10 + i * 2`) and its "Recommended
  mix"; deleted the Legacy homepage's `RecruitingFitPanel` (a private fit
  model with invented division bands and a 4–98 "confidence score"); the
  Legacy homepage's "67 programs ranked" is now the real catalog count;
  "Bank 6+ sectional results" / "2+ national L1/L2 events" lost their
  numbers; the homepage calculator no longer sends its example values
  (UTR 9.4, GPA 3.7, women's, a grad year) to /onboarding as answers — only
  fields the visitor changed travel; sign-up no longer pre-selects a
  player's team and grade (email: Male/10th; Google: Women's/10th);
  the homepage's "Emory range 9.1–10.6" caption and the outreach/tournament
  pills are labelled "Example"; the sample report no longer calls its
  example data "Real activity". The events calendar heading is "Schedule".
- Left alone, noted: `PARENT_ROW_GRADE` (10) for a parent's own row (never
  shown; now one named constant), `emptyPlayer.graduationYear` 2028 and
  `commitmentDate` (fallbacks; commitment date is stored, never shown —
  making them nullable is the same 79-site class of change as
  `currentUTR`), "most players improve 0.5–1.5 a year" (tied to
  `PLANNING_PACE_CAP_PER_YEAR`, documented as an assumption in
  lib/config/growth.ts but worded as a fact — a wording pass is
  recommended), /today's "5 min" estimates.

---

## 2026-11-19 — PR D (fix/audit-2): the owner's audit decisions, and calls made during the build

Owner's decisions (from the audit brief):
- **Bands plan with a conservative pace: min(the player's own pace, 1.5 a
  year)** — `PLANNING_PACE_CAP_PER_YEAR` in `lib/fit.ts`, the only place the
  number lives. The faster line is shown as "At your current pace you'd reach
  X. We plan with Y because most players improve 0.5–1.5 a year." and dashed
  "Estimate" on the charts; it never touches a band. Undo: set the cap to
  Infinity (tests will say which screens move).
- **No default plan goal.** Reverses C11. The pace warning is only for a goal
  the player set that needs more than the cap.
- **Signed-in /onboarding:** onboarded → /settings/profile; not onboarded →
  the new diagnostic in signed-in mode. Legacy flow and rating labels deleted.

Calls made without asking:
- The Reach / Out-of-range split ALSO plans with the cap. A hot streak no
  longer keeps a school in Reach. Undo: stop passing `paceCapPerYear` to
  `classifySchoolFit` in `buildFitReport`.
- The upside sentence prints two decimals ("8.10"); other estimates keep one.
- The what-if "My pace" is the player's own logged pace (uncapped) — the
  same number as the upside — not a separate regression.
- Tournament verdicts come only from the draw's average UTR vs the player's
  (in range −0.5…+1.0 → can be "Worth it"; stretch to +2.0 or easy to −1.5 →
  "Worth a look" at best; further → "Skip it"). The level-to-UTR table had no
  source and is deleted; without a draw average the checker says "Not enough
  info". The checker gained a draw-average field the mockup doesn't have.
- `tournament_entries.status` 'saved' is shown as "Planning"; 047 adds
  'played' without rewriting rows. Entered and Played both count as spend.
- The family account holder cannot "Leave family" (046 refuses
  `account_holder_cannot_leave`); their way out is deleting the account.
  An under-13 who leaves goes back to consent pending.
- `tournaments_goal` (always 12, never asked) and `tournaments_played` (never
  written) are out of the coach email. They still appear elsewhere (TODO).
- School page cards are equal height again (reverses C22's content height).
- PR E's input `docs/data/official_rosters_2026-27.tsv` does not exist; PR E
  ships the importer/schema/form tested on a fake fixture and no numbers.

---

## 2026-11-18 — PR C review follow-ups: hidden sessions, goals below today, Undo's timestamp

**/events shows every session a player put there, not only the new manual
plan's.** A session is shown when its plan is the manual plan, or is named
exactly "My sessions" (the plan the old calendar's withGuaranteedPlan()
created, metadata {}), or the session was created more than a minute after
its plan. Generator rows — written in the same instant as their plan — stay
hidden, as before. The one-minute rule is a heuristic, chosen because a
generator writes a plan and its sessions together and a person cannot; the
reviewer's read-only check found all 28 production sessions created with
their plans. *Undo:* make isPlayerAddedSession() (lib/db/training.ts)
return only the metadata check.

**A chosen plan goal must be above today's rating.** Rejected, not allowed
with a note: a goal at or below the current UTR puts every checkpoint
behind the player and the pace warning reads 0/yr, which says nothing
useful. The editor says "Your goal needs to be above your current UTR,
5.95." (planGoalInputError, lib/fit.ts). A goal saved earlier that the
player has since reached is not deleted; /plan says "You've reached your
6.20 goal. Set a higher one, or use the estimate." *Undo:* drop the second
check in planGoalInputError.

**Known, not changed: Undo restores a deleted row with a new created_at.**
Undo re-inserts the result or session the player just deleted (same
fields, a fresh row), so its created_at is the time of the Undo. Nothing
sorts or filters by created_at on these screens, and for a session it does
not change visibility (an Undo is a new row in the manual plan). Recorded
so nobody reads the timestamp as the original entry time.

**The nav "Tools" group is unchanged pending sign-off** on the CLAUDE.md
"5-item nav" wording (Results and Tournament checker sit in a secondary
group under the five).

---

## 2026-11-18 — PR C sweep: tournament checker, outreach board, schools

**The tournament checker gives no verdict until the level and the entry fee
are in** (C15). No level is pre-selected any more, and a blank fee no longer
scores as "$0 / match". A fee of 0 is accepted as an answer (a free event).
Travel cost stays optional. The rule is `verdictBlockers()` in
lib/tournament-fit.ts. *Undo:* default `level` back to `"L4"` and drop the
blocker check in the view.

**/events' Upcoming card uses the same rule** (fixed when the sweep's three
branches were merged): an entry saved without a fee shows "No verdict" and
"To see a verdict, add the entry fee." instead of "Good fit"/"Skip it". The
same change fixed a crash: with no UTR logged the card read a verdict from
an empty map (`fits.get(id)!`) and /events threw for any player with a
saved tournament.

**The /schools header counts what the table shows** (C25) — "Showing 4 of 37
men's programs." when a filter is on — and filters still persist across
visits. Chosen over not persisting the filter: a family that narrowed the
list to Saved expects it narrowed next time; what was wrong was the header
claiming 37. *Undo:* print `ranked.length` again in seeded-schools-browser.

**Outreach shows every saved target on the board, in Researching when it has
no outreach row** (C13). No row is written just by viewing; one is written
the first time the family moves the card, sets a reminder, or marks it sent.
**Fit-band chips are gone from pipeline cards** (C28): the band lives on
/schools and the school page; on the board it read as a second status.

**The route wrapper's fade-in no longer fills forwards** (tailwind.config.ts,
`backwards` instead of `both`). Filling forwards kept the wrapper a stacking
context for ever, so every in-page Drawer (z-50) painted under the phone
header and tab bar (z-40): the Add-to-events drawer's title and close
button were hidden at 375px. Visually identical at rest. *Undo:* `both`.

**C3 root cause, as far as staging can show it.** The save itself works for
the sweep persona (201 and the row in Upcoming), and staging's API log had
no tournament_entries request in the 24 hours before — so the report's save
never left the browser. The drawer's City/State placeholders read
"Bethesda"/"MD" (an empty form looked filled), Save stopped on one small
"City is required." line, and the date was pre-filled with today. Now: blank
date, no data-looking placeholders, per-field errors with focus, a plain-words
message for every server failure (RLS, rate limit, signed out), INSERT
instead of upsert for a new entry, and every "tournament-entries" SWR key
revalidated on success. Production was not inspected (staging only).

---

## 2026-11-18 — PR C numbers: one projection, two decimals, local dates, a real goal

Made in the production sweep's numbers branch. Each is a deliberate change
a reviewer might otherwise read as a regression.

**ONE projection (C8).** The fit report's `utr` (lib/fit.ts
`recruitingTimeUtr`, via `buildFitReport`) is the only projected UTR any
screen prints — whatever rule that function applies (PR B's "One
projection rule", below, made it use a recent logged pace; merged into PR C
with nothing here changed: `lib/projection-single-source.test.ts` holds). The
school page's Pace row used to run its own regression through the logged
ratings ("8.5 by Jun 1, 2028") two lines above the report's "7.5 for summer
2028"; /today and /plan shaded that same regression. Now the Pace row
prints `report.utr.value` and says in words whether the player's logged
pace reaches this team's floor (read off the band — the 2026-11-16 Reach
rule is unchanged); both charts shade `projectionPath(report.utr)`, which
only draws straight lines from today's rating to the report's
low / value / high and decides nothing. The what-if panel's "My pace" button still extends the
logged trend: it is a hypothetical the player asks for, labelled as one.
*Undo:* `explainSchoolFit`'s `pace` block and the two chart components.

**Two decimals for a player's rating, one for estimates (C10, C19).**
`formatPlayerUtr` (lib/utils.ts) is the only formatter for a rating a
player logged, typed, emails or exports — 5.95, 5.80, 9.00 — in chips,
charts, inputs, the tournament checker and the coach email. Estimates —
the projection, team floors/averages/ranges, gaps to them — stay at one
decimal (`formatUtrEstimate`): they are rounded to 0.1 in lib/fit.ts on
purpose, and "7.50" would claim a precision the assumption does not have.
Plan goals and checkpoints are on the player's own scale and use two.
`formatUTR` survives as an alias of `formatPlayerUtr` so no caller keeps
the old "9.0" / "9.50" mix. *Undo:* lib/utils.ts.

**Date-only values are local days (C9).** `toLocalDateString(d)` writes and
`parseLocalDate("YYYY-MM-DD")` reads every Postgres `date` column;
`localDateKey` is now the same function. Vitest runs files in worker
threads, where assigning `process.env.TZ` mid-run does not change the zone,
so the two-zone proof is a script — `npm run test:tz` (New York, then
Auckland) — and `lib/local-dates.test.ts` asserts in whichever zone it runs.
Two existing fixtures used UTC instants as "Sunday"/"Jan 15" and failed in
Auckland; they now use local times.

**The plan goal (C11).** Default = the fit report's estimate for the
summer before senior year (`report.utr`, the number every ProjectionNote
prints), so the default plan needs a realistic pace and adding a target
never moves it. A
player can set their own goal on /plan; it is stored in
`user_settings.notification_preferences.planGoalUtr` — the same JSON bag
that already holds the player's other preferences — so no migration, and it
is in the account export with the rest of `user_settings`. An unrealistic
chosen goal shows the same warning on /plan and /today
(`GoalPaceWarning`, rule `goalPaceNeedsWarning`), offering the estimate
back. Checkpoints now sit on a straight line in time to the goal (they
moved in equal grade steps). *Undo:* `buildRoadmap`'s old target-floor goal
in lib/db/plan.ts and `usePlanGoal`.

**"Show realistic targets" (C5) — kept, made real.** It keeps targets whose
floor the estimate reaches (the report's recruiting-time band is Target or
Likely), read from the report without the what-if override, and is only
offered when it would hide something. It moved from the pace warning (which
the new default goal rarely shows) to the target list's header.

**Today's next steps (C12).** When there are no coach actions, or some
targets are off track, Today lists up to three steps that link to features
that exist: log your UTR (drawer), add targets you're on track for
(/schools), log a match result (/events), check a tournament
(/tournament-fit). The headline never says "caught up" over them.

**"Top D1 programs often decide earlier, during junior year." lives on the
/schools list only (C16).** Niran's 2026-11-16 call that the line exists
somewhere a player will see it is kept: /schools is where a player chooses
programs. It is gone from Today, Plan, the school page and /family. The
pre-auth fit report still prints it beside the timing note; that screen is
onboarding's rebuild (board 20) and was left to it. The NCAA contact-period
caveat on /plan's timeline is said once, at the top of the card.

**Copy (C24).** /plan has an H1 "Plan" (the player's name is now an H2).
"Top (drawn)" → "Top of range". The school page no longer says "#1 of the
D1 men's programs in Seeded on our combined score" — it was a ranking only
Seeded uses; the U.S. News rank stays. "Live data, your own account." is
gone from Today and Plan.

**Charts (C21).** Both charts draw in a viewBox as wide as their column, so
12px text stays 12px at 320 and labels are anchored inside the edges; the
y-axis covers every logged rating; /plan's checkpoint labels sit above-left
of each diamond, off the rising dashed line.

---

## 2026-11-18 — PR C sweep: one manual calendar, no Match mode, a Tools group

Made in the production sweep (items C1, C2, C6, C7, C14, C17, C18, C20,
C26, C27). Each is a deliberate change a reviewer might read as a regression.

**The training calendar shows only sessions the player added by hand.**
`workout_sessions.training_plan_id` is NOT NULL, so "sessions with no plan"
cannot exist; the brief's `training_plan_id is null` was not expressible.
Instead a player's own sessions go into ONE `training_plans` row per player
with `metadata = {"kind":"manual"}`, created on first add, and the calendar
reads only that plan (lib/db/training.ts). Production was checked read-only
first: 28 sessions in 5 plans, every plan generator-named ("6h personalized
recruiting week", "UTR build week", "5.5 UTR build week", "10h personalized
recruiting week", and an empty "Regular Training") — so no hand-made session
is hidden by this. **No data migration was written.** The 28 rows are hidden,
not deleted; deleting them is Niran's call (one `delete from training_plans
where not metadata @> '{"kind":"manual"}'` — cascades to their sessions —
after a backup). *Undo:* read every plan again in `loadTrainingSessions`.

**Writes are per row, never a whole-state save.** `/api/training/planner`
re-upserted every plan and deleted every session not in the state it was
sent. With generated rows filtered out of the UI, the first ordinary save
would have deleted all of them — a data decision made by accident. It and
`/api/training/templates` are deleted; `/api/training/sessions` creates,
updates and deletes single rows, each filtered by owner AND manual plan.

**Session types are a fixed list** (lib/training/session-types.ts), in
tokens. The old page let a player invent types into
`user_settings.notification_preferences.session_types`; that data is left in
place and unused. An unknown type shows as "Tennis".

**Week and Month render one list, grouped by real date.** Month used to
group by weekday — a "recurring template" — so generated rows dotted every
day while Week (by real date) showed none.

**Match mode is deleted; `/match-mode` redirects to `/matches`.** Its only
feature was a prep plan Seeded wrote from a template (warm-up, tactics,
packing list) — generated content, which CLAUDE.md rules out — plus a
"remind me" flag that sends nothing. `generatePrepPlan()` went with it; a
logged match stores an empty `prep_plan` (the column is NOT NULL). /events'
"Log a result" opens the same form /matches uses
(components/matches/match-result-form.tsx). *Undo:* git history.

**`/training` redirects to `/events` for both designs**, and /events no
longer has a Legacy tab view. Legacy users see the Seeded events page.

**A secondary "Tools" group under the five** (C26): Results and Tournament
checker, in the sidebar, the avatar menu on phones (the bottom bar stays
five) and ⌘K. CLAUDE.md's 5-item rule is about the primary nav and is
unchanged in substance; its line now says so. The sidebar's dark-mode
toggle is gone — Settings → Appearance is the one place.

**Today's "History" link is now "Check-in history" → `/today/check-ins`**
(C7), a new page: a 12-week heatmap and every check-in, newest first, from
real `daily_checkins` rows. It pointed at /events, which shows none.
`loadDailyCheckins` gained an optional `days` argument for it.

**Overlays render in a portal** (components/ui/portal.tsx). The staging run
found the check-in drawer's Save button under the phone tab bar at 320px:
every page sits in AppShell's animated wrapper, a stacking context, so a
z-50 drawer could not rise above the z-40 bars. The Drawer, the Seeded
dialog and the Toast now render on `document.body`; the toast sits above the
tab bar on phones. `ModalShell` (components/seeded/family/budget-modals.tsx)
was not changed — it is the family pass's file — and has the same issue.

**Every native confirm/alert/prompt is gone** (C6) and banned by
`lib/no-native-dialogs.test.ts`. Deleting a result asks in the Seeded dialog
and then offers Undo (re-saves the same record). Deleting a session has no
confirm, only Undo — it is one tap to restore, the same rows by id.

**Gradients are banned on Seeded screens** (C17,
`lib/design-system-v2.test.ts`), with five allow-listed files. One was a
real open violation: `components/auth/parent-login-form.tsx` (glass card,
gradient button on /parent-login). That file was unused (/parent-login
redirects to /login) and was deleted in PR-QUALITY (2026-11-20); the
allow-list now has four entries.

**`plural(n, one, many)`** in lib/utils.ts is the one way a count meets a
noun; `lib/plural.test.ts` scans for hand-rolled `${n} …s`.

---

## 2026-11-18 — One projection rule for onboarding and the app

**Decision.** The "UTR at the summer before senior year" is decided in one
place, `recruitingTimeUtr()` in `lib/fit.ts`, and both the signed-in app
(`buildFitReport` → `useFitReport`, the parent chart's `projectionReachDate`;
its line is PR C's `projectionPath` since the numbers merge) and the onboarding diagnostic (`diagnosticProjection`,
now a thin wrapper) call it:

1. Summer before senior year begun → today's rating.
2. A real logged rating 5–13 months old (local calendar days, inclusive; the
   one closest to 12 months among those ≥ 9 months old, else the one closest
   to 6) → the player's own pace, `(today − past) / months`, carried to
   June 1 of grad − 1, capped at `REALISTIC_UTR_CEILING`, never below today
   (a falling rating is held). One value, no slow/fast range. Labelled by
   `loggedPaceAssumption()`: "At your logged pace (+0.25 a month since May
   2026)."
3. Otherwise → the typical-growth estimate with its existing label.

The diagnostic's answers become dated ratings at the same local dates
sign-up writes them to `utr_entries`, so for the same moment the card and
the app give the same number (`lib/fit-onboarding-consistency.test.ts`).

**Why.** Before this, a player who answered the diagnostic saw one summer
number (their own pace), signed up, and the app showed another (typical
growth). One number before and after sign-up is the point of the
diagnostic. And a junior with no history is never banded at today's rating —
the bug `recruitingTimeUtr` first existed to fix.

**Deliberate deviation from board 20.** The board says "No past rating → use
today's rating and say so." The diagnostic now shows the typical-growth
estimate instead, because that is what the app will show the moment they
sign up, and because banding a 13-year-old at today's rating is the original
bug. The board's "say so" is kept by the label ("Assumes typical growth of
1.0 UTR per year.") and by the report's prompt to add a past rating. The
falling-rating case (decision 3 of the B1 entry below) is kept, now inside
rule 2.

**What changes for existing players.** Anyone with an entry 5–13 months old
now sees their own pace. Staging persona (a) (8.70, Class of 2031, Feb 8
2026 at 8.20): summer-2030 estimate 12.2 → 11.0. `fake-sweep-player` (5.95,
Class of 2029): 7.5 → 6.6 on Nov 18 (its 13-month entry), 6.5 from Nov 19
(its 5-month entry). The window slides: as a rating ages past 13 months the
estimate falls back to typical growth until the player logs again.

**Synthetic lines are never a pace.** The homepage passes the realistic-pace
line (P1-FIT-4) as `projectionInput`; `syntheticUtrHistoryFor()` now marks
its points `synthetic: true` and `loggedPaceFor()` skips them, so a visitor
is never told an assumed line is "your logged pace".

**Undo.** In `recruitingTimeUtr`, delete the `loggedPaceFor` branch (rule 2)
and restore `diagnosticProjection`'s own pace arithmetic from `23d792a`.
`lib/fit-onboarding-consistency.test.ts` will fail — that is the
inconsistency the B1 entry's "Known inconsistency" paragraph describes
coming back; delete it in the same commit. Revert the /methodology paragraph.

---

## 2026-11-18 — PR B: /family to Board 22, and the Family paywall (app side)

**Budget bars: one limit, not one per category.** Board 22 shows per-category
bars with "Near limit" / "Over by $X" chips and "Gear is $60 over. Lessons
has $380 left…". `season_budgets` holds one total per family and
`budget_expenses` has three categories (entries, travel, camps) with no
limits, so only the season total carries a status; category bars show their
share of the total and no chip. `lib/parent-dashboard.ts` already handles
per-category limits (the board's sentence is a test case) — add a
`category_limits` column and pass it to `seasonBudgetView()`. *Undo:* n/a.

**"At a typical pace", not "At this pace".** The estimate is lib/fit.ts's
typical-growth assumption, not the child's own trend, so the caption says so. *(Since "One projection rule", above: when the child has a logged
rating 5–13 months old the line IS their own pace, and the caption says "At
the pace in Avery's logged ratings" instead.)*

**The estimate prints one decimal ("≈ 9.1 estimate"), logged UTRs two.**
lib/fit.ts rounds projections to one decimal on purpose and ProjectionNote
on the same page prints it that way; two would claim precision the
assumption does not have. Logged ratings use `formatPlayerUtr` (this entry
first named PR B's own `formatUtr2`; PR C's numbers merge made the two one
function, and moved the "target schools start at" floor to
`formatUtrEstimate`, one decimal, like every other team number).

**Dropped from /family: "Needs a parent decision", the family members card
and the top scope line.** Not on Board 22. Members live in Settings; the
scope sentence is the sidebar note (and a line at the foot of the page on
phones). The join-requests/consent card stays on /family on every plan —
approving an under-13 must never be behind a paywall.

**Settings is in the parent's main nav** (Board 22's five items); the ⌘K
palette lists it once.

**The paywall's Example preview runs sample rows through the real
builders** (`components/seeded/family/dashboard/sample-model.ts`): no real
school is named, the preview is hidden from assistive tech and inert, and it
wears a dashed "Example" chip. *Undo:* drop the `<section>` in
family-plan-paywall.tsx.
## 2026-11-18 — /onboarding diagnostic (PR B, B1): four calls

Made while building board 20. Each one is a place a reviewer could read the
behaviour as a mistake.

**1. A parent's answers about their player are never stored.** A parent who
fills in the diagnostic sees the result and the fit report from their
answers, and can create THEIR OWN account (role parent, own name, own birth
year, start or join a family). Nothing they said about the player — UTR,
past ratings, grad year, birthday, GPA, start term — is written anywhere:
`diagnosticPlayerProfile()` throws for a parent and `diagnosticUtrEntries()`
returns nothing. The parent gets the family code and is told, on screen,
that the player answers for themselves (about 90 seconds) when they join
with it. Considered and rejected:
- *Write them to the parent's profile* — board 22 and CLAUDE.md: a parent's
  profile holds no UTR or player stats. The player's birth year on the
  parent's row would also make the parent's own account read as under 13
  (birth_year is write-once and drives `consent_status`).
- *Hold them somewhere and hand them to the player when they join* — needs a
  new table or column with its own RLS, retention and deletion story, for a
  minor's data the minor never entered. Not in this PR's scope (no
  migrations), and the privacy policy would have to describe it.
- *Keep them in the browser for the player* — the player usually signs up
  on another device; on a shared one it would leave a child's ratings in
  storage for whoever is next.
*Undo:* a later PR that adds a "pending player profile" with its own RLS;
`diagnosticPlayerProfile` is the one place to change.

**2. The diagnostic projects from the player's OWN pace, and its fit report
uses that number.** *(Superseded the same day by "One projection rule for
onboarding and the app", above: the app now uses the same rule, and a player
with no past rating sees the labelled typical-growth estimate.)* Board 20: pace = (today − year ago)/12 or (today − 6
months ago)/6 per month, carried to June 1 of grad − 1; no past rating, or
the summer already started, → today's rating, and the card says so.
`diagnosticProjection()` in lib/fit.ts; the fit report after it is built by
`buildDiagnosticFitReport()` with that projection as its recruiting rating,
so the "Projected UTR" card and every band on the next screen are one
number. Consequence: a player with NO past rating gets a report judged at
today's rating (the "Today" view only), where the old pre-auth report
assumed typical growth of 1.0/yr. That is what the board specifies, and it
is the more honest of the two (no assumed growth is shown as theirs).
**Known inconsistency, not fixed here:** after sign-up, the app's own fit
report (`useFitReport`) still projects at typical growth, so a player who
gave past ratings can see a different summer number in the app than the
diagnostic showed. Fixing it means deciding, app-wide, whether logged pace
replaces typical growth — a product call bigger than onboarding.
*Undo:* drop `recruitingUtr` from the `buildFitReport` call in
`buildDiagnosticFitReport`.

**3. A rating that went DOWN is not carried forward.** If the past rating is
higher than today's, the projection is today's rating and the note says
"The rating went down, so this stays at today's UTR." Board 20 does not
cover it; extrapolating a dip (injury, a hard season) into a lower
"projection" would tell a 13-year-old their pace is a decline. *Undo:* the
`pacePerMonth < 0` branch in `diagnosticProjection`.

**4. No separate slim header; the header CTA is hidden on /onboarding.**
Board 20 draws a slim header (logo, progress, Sign in). Board 23 and the
2026-11-16 decision say ONE header on every route — /onboarding had no
`<header>` at all once and lost its navigation for search visitors. So the
shared header stays and the progress strip ("Question N of 9 · About 90
seconds" + bar) sits under it. The header's green "Get my free fit report"
links to the page you are on and was a second green button beside
Continue (rule 1), so `SeededNav` leaves it out on /onboarding only.
*Undo:* `NO_CTA_ROUTES` in `components/seeded/layout/nav.tsx`.

---

## 2026-11-16 — Design system v2: one footer, Legacy only in Settings, fewer caveats

Made in PR A (`fix/ui-polish-1`) to put `docs/DESIGN_MOCKUP_SPEC_V2.md`
board 23 into the live site. Each is a deliberate change a reviewer might
otherwise read as a regression.

**One slim footer, rendered by AppShell on every route.** There were three:
a four-column footer on six marketing pages, a homepage-only one, and none
on /methodology, /privacy, /terms, /contact, the auth pages or the app.
Pages no longer render a footer; `Footer` under Seeded is the slim one
(Seeded · How we calculate fit · Privacy · Terms · support@), and Legacy
keeps its old footer. *Undo:* render `<Footer />` per page again and drop it
from `components/layout/app-shell.tsx`.

**"Switch to Legacy" moved to Settings → Appearance only** (Niran's call,
A4). It sat in the footer of every Seeded page, one click from a stranger
flipping the whole site into a design that fails the extras pass and is
slated for deletion. The Appearance card already had "Legacy theme"; a
signed-out visitor can no longer reach Legacy at all, which is the point.
*Undo:* restore the button removed from `components/layout/footer.tsx`.

**One calm data note per card instead of chip stacks** (rule 2). The roster
estimate is still labelled wherever a team number appears (CLAUDE.md), but
as one sentence — "The team range is our estimate, not a published roster."
— plus an "About our data" link, not a chip AND a three-line paragraph.
`ProjectionNote` is now that note: the dashed Estimate chip, the estimated
UTR for the summer before senior year, and "Top D1 programs often decide
earlier, during junior year." (Niran, 2026-11-16, kept). The growth
assumption sentence it also carried now lives only in /methodology and
beside the what-if slider. *Undo:* `components/seeded/ui/projection-note.tsx`.

**"edition year not recorded" removed** (rule 4: say nothing). The school
page now reads "U.S. News academic rank #18." *Undo:* `lib/school-academics.ts`.

**The "unverified" fit band reads "No UTR yet"**, and "Not tracked" is gone
from fit cells (an empty cell instead) and UTR tiles ("No UTR yet"). That
band only ever meant "this player has no rating to compare", which
"Unverified" did not say.

**/schools hides "Your fit" until a UTR exists** (A7) — a column of "Not
tracked" on the page a first-time visitor sees most. The "columns reappear
automatically" note about untracked openings/verification is gone too.

**The homepage's final CTA band is an ordinary surface with the ordinary
green button**, not a fixed-dark band with a lime button. Lime is never a
button fill (rule 1); court green on that dark band measured ~2.7:1 in light
mode, under the 3:1 a control boundary needs. The parents panel stays dark
and its button is an outline in the panel's own text colour.

**The account's role is kept in localStorage (`seeded.role`)** — only the
word "parent" or "player", no id or name — so the head script can mark
`html[data-role]` before React runs and a placeholder can be the right
height for a parent or a player. Cleared on sign-out. It is a layout hint,
never an access decision (RLS and route-access decide access). *Undo:*
`rememberRole` in lib/layout-hints.ts and the head script.

*Extended 2026-11-18:* **/schools also remembers its last shape
(`seeded.schools.shape` = `fit` | `nofit` | `prompt`)**, read by the head
script into `html[data-schools-shape]` (only alongside a session). The
pre-session placeholders assumed every account HAS a fit, so the three that
never get one jumped when the smaller content landed: a player with no UTR
(CLS 0.149 at 1440), a parent in a free family (0.078 at 375), a parent with
no linked player yet (0.151 at 1440). Three values, not fit/no-fit: a parent
can land on either the no-rating parent block (`nofit`, a longer sentence
than the fit one) or the "Enter your UTR" banner (`prompt`, no linked
player), and the two differ by up to 40px. `prompt` needs no placeholder —
the pre-session render already is that banner, so CSS just un-hides it.
The page stores the shape once it has resolved; the player context also
stores a player's from their own rating at sign-in, so a player's first
/schools load is right too. A parent's first load after sign-in still
assumes `fit` (the roster is what decides it), so only that one load can
shift. Same rules as the role: a layout word, no id/name/rating; cleared on
sign-out; a stale value costs one shift. Measured on a production build
(scripts/cls-sources.mjs, CLS_WARM=1): every persona ≤ 0.0216 at 320/375/1440.
*Undo:* lib/layout-hints.ts's `SCHOOLS_SHAPE_KEY` users, the head script's
`data-schools-shape`, and the `data-schools-shape` rules in globals.css.

**Focus ring:** court green on light, lime on dark, via one `--c-focus`
token and one global `:focus-visible` rule (rule 8). Before, Seeded buttons
had a lime ring (1.2:1 on cream) and every link had the browser default.

---

## 2026-11-16 — Migration 040: the Free target cap blocks only growth

**Decision (Niran's, on the options laid out mid-rollout).** Fix forward
rather than roll 024 back. A Free account may never grow its target list
past 3, but a save that does not add schools always goes through, and an
upsert's INSERT half on an existing row defers to the UPDATE half.

**Why.** 024 was already on production when its pre-check found 2 real Free
players with 5 schools. As written it would have refused every profile save
they made under the v1 code, and refused pruning one school at a time.
Rolling 024 back instead would leave the v1 code gating outreach at Player
while the database still required Family — a broken board for every new
Player buyer.

**How to undo.** Re-run 024's `create or replace function` block (§J step
14d). Rehearsed on staging before and after.

---

## 2026-11-16 — Reach vs Out of range: one rule, the player's logged pace

**Decision.** In every view (today, the summer-before-senior-year estimate,
and the what-if), a school below the team floor is **Reach** when the pace
in the player's real logged ratings reaches the floor by the summer before
senior year, and **Out of range** when it does not — exactly the sentence
`/methodology` already printed. Fewer than three logged ratings → Reach,
also as `/methodology` says. The rating decides Likely / Target / below the
floor; the history only splits below-the-floor, at the same date.

**Why.** The projected view was growing the estimate a further 1.5 years
past the summer before senior year (a leftover from the old junior-year
target) to decide Reach. The independent verifier showed the same 12.2 on
the same date banded **Reach 10 · Out of range 3** by default and **Reach
0 · Out of range 13** when typed into the what-if. Growth past the point
coaches decide is not a forecast.

**What a family will notice.** Persona (a) (Class of 2031, logged pace
11.4 by June 2030, typical-growth estimate 12.2) now shows Reach 0 in the
summer-2030 view: every program above 12.2 is above the pace too. A player
whose logged pace is *faster* than the typical-growth estimate still gets
Reaches. A player with fewer than three ratings sees Reach for every
program above the estimate, as before and as `/methodology` says.

**Undo.** Restore the `residualYears` / `syntheticUtrHistoryFor` block in
`buildFitReport` (`lib/fit.ts`, removed in `6ac824e`). The regression test
in `lib/fit.test.ts` ("one rating on one date gets one band") will fail —
delete it in the same commit, and change `/methodology`'s Reach sentence.

## 2026-11-16 — Browsers for the harness installed by hand

**Decision.** WebKit and Firefox were unpacked from Playwright's own CDN
archives (`playwright.azureedge.net`, the URLs `playwright-core` 1.49.1's
registry names) into `~/Library/Caches/ms-playwright/webkit-2104` and
`~/Library/Caches/ms-playwright-ff/firefox-1466`. **Why:** `playwright-core
install` downloaded to 100% and then hung at 0% CPU while unpacking, three
times, leaving WebKit with one file in it — which is why the verifier could
not run WebKit at all. Firefox lives in its own folder because installing it
into the shared one evicted WebKit. **Undo:** delete either folder.

## 2026-11-15 (overnight) — onboarding asks for a rating; it never assumes one

**Decision.** The signed-in onboarding's UTR step starts empty ("—") and
Continue needs either a moved slider or "I don't have a UTR yet"; the
pre-auth fit report's UTR box no longer pre-fills "7". **Why:** an untouched
Continue saved 7.0 as the player's real rating and history, which flowed
into bands and the coach email. **Not changed, and logged for week 1:** the
same flow's Grade (preselected 10th) and gender (preselected men's) are
visible, confirmable choices rather than silent defaults, so they were left;
they deserve the same treatment. **Undo:** `useState(player.currentUTR || 7)`
in `components/onboarding/onboarding-flow.tsx` — don't.

## 2026-11-15 (overnight) — Settings is reachable before onboarding

**Decision.** `isOnboardingExemptPath()` lets an un-onboarded player open
`/settings`. **Why:** export and delete must not require handing over more
data first; `/privacy` says you need no reason and no request. **Undo:**
remove the two `!isOnboardingExemptPath(pathname)` checks in AuthGate.

---

## 2026-11-15 (overnight) — the mobile tab bar keeps its 11px labels

**Decision.** The brief says no text under 14px on anything a user acts on.
The five-item mobile tab bar's labels are 11px, exactly as the mockup
(MobileToday.dc.html) draws them. Kept. **Why:** each tab is a 52px-tall,
75px-wide target whose icon carries it; the label is supplementary, and
14px "Weekly reports" in a quarter of 375px wraps to two lines. CLAUDE.md
makes the mockups the source of truth for UI, and this is the one place the
two rules collide. The harness reports it rather than hiding it.
**Undo:** `text-[11px]` → `text-sm` in `components/seeded/layout/sidebar.tsx`'s
mobile tab bar and check the parent's four labels at 375.

## 2026-11-15 (overnight) — no google.com/search links; a copyable phrase instead

**Decision.** "Find the coaching staff" linked
`https://www.google.com/search?q=…`. The brief bans google.com/search links.
Replaced on the school page, the outreach composer and Legacy's coaches view
by `StaffDirectoryHint`: the phrase to search ("Barry University men's tennis
staff directory") and a Copy button, linking nowhere. **Why not another
search engine:** same objection, different host. **Why not the athletics
site:** Seeded has no verified URL for any program, and a guessed one is the
`example.com` ×68 problem P0-3 removed. **Undo:** restore
`staffDirectorySearchUrl()` in `lib/db/schools.ts` (git history) and the
three `<a>`s.

## 2026-11-15 (overnight) — parents get their own Settings; /api/profile writes only their name

**Decision.** A parent account's `/settings` is `ParentSettingsView` in both
designs; `/api/profile` reads the caller's role from their own row and, for
a parent, updates `name` only. Five player-data write routes refuse a parent
(403) before parsing. **Why:** the parent was shown the player's profile
form under a "read-only" label, and every save wrote defaulted stats onto the
parent's own row. **What it does NOT do:** RLS still lets any account write
its OWN rows in the player tables, so a parent calling PostgREST directly can
log a UTR under their own id. They can never touch the child's rows
(attack-tested), and family screens read the child's rows by the child's id.
Closing that needs a role check in those tables' INSERT policies — a
migration, and tonight's ground rules allow one only for a HIGH that cannot
be fixed otherwise. Logged as week 1. **Undo:** remove the
`player.role === "parent"` branch in `components/settings/settings-view.tsx`
and the parent branch in `app/api/profile/route.ts`.

## 2026-11-15 (overnight) — every family-readable loader names its subject

**Decision.** `loadMatches`, `loadTournamentEntries`, `loadCoachOutreach`,
`loadCoachOutreachDated` and `loadDailyCheckins` take a `DataSubject`:
`"self"` (default), `{ userId }`, or `"family-players"`. The old behaviour —
a parent viewer got `.in("user_id", <every approved member>)` — is gone.
**Why:** it pooled siblings and the parents' own rows into what each family
screen presented as one player's: the last pass's CRITICAL, generalised. The
family budget alone uses `"family-players"`, on purpose: it is the family's
money across all its children; its fit verdicts judge only the shown
player's own entries. **Undo:** not recommended; the old pooling is in git.

## 2026-11-15 (overnight) — the cost calculator starts empty and has no scholarship card

**Decision.** Removed `annualCost`/`scholarshipPercent` (and "Net: $…" under
real school names) entirely, and the $115/$1,200/$550 default inputs. The
calculator now totals only what the family types. **Why:** each was a
Seeded guess presented next to a real school or as the family's own total.
It renders inside `/family/budget` for Seeded parents (the standalone
`/cost-calculator` route redirects to `/family` in Seeded), so this was a
parent-facing surface, not a Legacy-only one.
**Undo:** git history; do not, without per-school sourced data.

## 2026-11-15 (overnight) — Playwright WebKit and Firefox installed

**Decision.** `npx playwright-core install webkit firefox` (Microsoft's
Playwright CDN; `playwright-core` is already a devDependency). **Why:** the
brief requires Safari and Firefox coverage and only Chromium was cached.
Nothing in the repo changes; the browsers live in
`~/Library/Caches/ms-playwright`. **Undo:** delete those two folders.

---

## 2026-11-15 — the joined-member read gap: widen the predicate, not the column

**Decision.** Migration **036**. An approved member of a family can read any
other APPROVED member's profile, UTR history, matches, tournaments,
check-ins, cost projections and outreach — whichever of the two membership
shapes either of them holds. Implemented as a single predicate,
`shares_approved_family_with(uuid)`, replacing seven read policies, plus a
`stamp_family_code` BEFORE INSERT/UPDATE trigger on the nine tables that
carry their own `family_code` column.

Niran decided the policy question (quoted in the migration header); the
decisions recorded here are the three I made in implementing it.

**Why not just set the joiner's `profiles.family_code` on approval** — by far
the smallest change, and the first candidate in `docs/TODO.md`:

> `remove_family_member()` only deletes the `parent_accounts` row.

A removed member would keep a `family_code` on their profile and therefore
keep every family read. Revocation has to live in exactly one place, and
`parent_accounts` is that place. Verified on staging: after
`remove_family_member()`, the parent's view of the removed player drops to
0 rows immediately. That test is the whole argument.

**Why the stamp is a database trigger and not an app fix.** The app did also
need changing — eight call sites in five files scoped their queries by
reading `profiles.family_code` and bailed out before RLS was ever consulted
— but *which family a row belongs to* is a security property, so it belongs
where no new call site can forget it. It also closed a hole that was already
open and unrelated to the bug: every INSERT policy on those tables checks
only `user_id = auth.uid()` and never the `family_code`, so a client could
stamp its own row with any family's code and publish its own data onto a
stranger's family page. After 036 the client's value is discarded on INSERT
and frozen on UPDATE. Tested: an insert supplying `FAKEFAMILY02` from a
member of `FAKEFAMILY01` lands on `FAKEFAMILY01`, and `FAKEFAMILY02` sees
nothing.

**Why no backfill — and a correction, because the first version of this
paragraph had the logic backwards.** It said rows written before 036 "stay
readable by their owner alone" and that backfilling "would retroactively
widen who can read data that was private when it was written." That is wrong,
and an independent review caught it: the seven rewritten policies key off the
row OWNER's current membership and ignore the stamp entirely, so **036 does
retroactively widen reads of every pre-existing row** on `profiles`,
`utr_entries`, `matches`, `tournament_entries`, `coach_outreach`,
`daily_checkins` and `cost_calculations`. Proven on staging: a NULL-stamped
pre-036 match is readable by the parent right now.

That widening is deliberate and it covers history — a parent who is approved
today sees their player's past results, not only the ones logged afterwards,
which is what anyone would expect of a family page. What is NOT backfilled is
the `family_code` column itself, and that is a much smaller claim: the column
stays NULL on old rows, which matters only for the four genuinely
family-scoped tables (`parent_reports`, `season_budgets`, `budget_expenses`,
`encouragement_notes`) whose rows are always written with a resolved code
anyway. Niran should know the read widening reaches backwards, because it is
the part a parent would notice and the part a lawyer would ask about.

**What I deliberately did NOT change.** `is_parent_member()` still grants
season-budget writes to any approved joiner regardless of `role`, so a
sibling player can write the budget. It is a write-authorisation change
nobody asked for, and putting it in the launch migration would mean
launching on a policy change no one had reviewed. `docs/TODO.md` carries the
fix (mirror 033's pattern).

**One over-reach I chose, and it should be read as such.** Niran's words were
"approved **parents** in that family may read that player's data." I
implemented "approved **members**", because that is already what the
working half does — `family_members_read` has meant "any approved member"
since 023 §8, so in the player-first flow a sibling could already read the
account holder's profile. Restricting the new path to `role = 'parent'` would
have made the same data readable in one flow and not the other, which is the
kind of asymmetry that produced this bug in the first place. The practical
delta is that a sibling player in the same family can read another sibling's
UTR. If that is not wanted, add `and exists (select 1 from profiles where
id = auth.uid() and role = 'parent')` to the predicate — but do it in both
flows or neither.

**How to undo.** `docs/HANDOFF.md` §J step 13 carries the full rollback.
Order matters: the seven policies must be restored before
`shares_approved_family_with` is dropped, or the drop raises `2BP01`. Both
the ordering failure and the clean rollback were run on staging on
2026-11-15.

An earlier version of this paragraph said the rollback restores the pre-036
behaviour "exactly". It does not, and the word was wrong: rows stamped while
036 was live keep their `family_code`, and the restored policies read
`… or is_family_member(family_code)`, so every row a joiner wrote during the
036 window stays readable by the whole family after the rollback. That is a
defensible outcome — the family could already see those rows — but it is not
"exactly" the prior state, and §J step 13's own note says so.

## 2026-11-15 — next@15, not next@16

**Decision.** Upgraded `next` 14.2.35 → **15.5.29** (and
`eslint-config-next` to match). React stays on 18.

**Why.** The brief asked for the smallest version that clears every
critical/high `next` advisory. 15.5.29 does: the `next` finding drops from
**25 advisories (3 critical, 9 high, 11 moderate, 2 low) to zero criticals
and zero highs**. Going to 16 as `npm audit fix --force` suggested would
have pulled a second major's worth of breaking changes for no additional
security benefit, and 16 removes `next lint` entirely, which is a separate
migration.

Only one breaking change actually bit: `params` is a Promise in Next 15
(`app/schools/[slug]/page.tsx`). Dynamic APIs went async so a page can start
streaming before the router finishes resolving them. No `cookies()`,
`headers()` or `searchParams` call sites existed to migrate, and the caching
default change does not affect us — nothing relied on the old implicit
`fetch` cache.

**How to undo.** `npm i next@14.2.35 eslint-config-next@14.2.35` and revert
the `await params` change. You would be re-accepting 25 advisories.

---

## 2026-11-15 — Pin postcss with an npm override

**Decision.** Added `overrides: { postcss: "^8.5.23" }` and lifted the direct
devDependency to match.

**Why.** `next@15.5.29` bundles `postcss@8.4.31` at
`node_modules/next/node_modules/postcss`, which carries two **high**
advisories — arbitrary file read via an attacker-controlled
`sourceMappingURL`, and path traversal in previous source-map auto-loading.
npm's only offered fix was `next@16`, a major, for a transitive package that
an override fixes outright. npm refused the override while the direct
devDependency range conflicted, so that was lifted to the same line; both now
resolve to 8.5.33.

**Result: production dependencies have ZERO vulnerabilities**, down from
1 critical + 1 high (29 advisories between them).

**How to undo.** Delete the `overrides` block. Re-check it whenever `next` is
upgraded — once next ships a safe postcss itself, the override is dead weight.

---

## 2026-11-15 — Left the vitest chain on 1.6.1

**Decision.** Did not upgrade vitest. The remaining dev-only vulnerabilities
(2 critical, 2 high: `vitest`, `tinypool`, `vite`, `brace-expansion`) stay.

**Why.** vitest 5 cannot be installed without `--legacy-peer-deps` or
`--force` against the current tree, and the brief rules out forced
resolutions. It is also four majors of test-runner migration. None of it
ships: these affect the test runner and the linter, not a single byte served
to a user. **Production deps are at zero**, which was the actual bar.

**How to undo.** `npm i -D vitest@5 --legacy-peer-deps`, then expect config
and API migration work. Tracked in docs/TODO.md.

---

## 2026-11-14 — Rewrote two lines of the pricing mockup's copy

**Decision.** The spec's footer line is "Cancel in two clicks. Accounts for
players under 18 are billed to a parent." Shipped instead: "Cancel any time
from your Whop account. Players under 13 need a parent or guardian to
approve the account before it works."

**Why.** The second sentence is not true. Nothing in Seeded or in Whop checks
who owns the card — a 16-year-old can pay with their own — so it describes a
control that does not exist. The first is a measurement of Whop's UI, which
we do not own and cannot keep true. The replacement says the thing that IS
enforced, in the database, by migration 030. Both originals are now patterns
in `lib/copy-honesty.test.ts`, so they fail the build if they come back.

**How to undo.** Only if the controls become real. Delete the test entries in
the same commit that makes them true — never reword around them.

---

## 2026-11-14 — "3 months free", computed, not "2 months free"

**Decision.** The toggle reads "Yearly · 3 months free", from
`yearlyMonthsFree()` in lib/types.

**Why.** The mockup says 2. At today's prices yearly saves 3.75 months on
Player and 3.6 on Family, so "2" understates — and a promise that understates
is still a promise nobody checked. The helper floors the saving and takes the
minimum across paid tiers, so the number is true for whichever plan the
visitor picks and moves on its own when a price changes.

**How to undo.** Replace the call with a literal. Then own the literal.

---

## 2026-11-14 — "Parent" on /signup links to /parent-signup

**Decision.** The spec's "I am the" pill radio is on /signup. Choosing Player
does nothing (it is already selected); choosing Parent navigates to
/parent-signup.

**Why.** `SignupFlow` had a `role` state with no UI and no working parent
path — the parent flow is a separate page with different copy, different
fields and a different landing page. A half-parent mode inside the player
wizard would have been a worse version of a page that already exists.

**How to undo.** Make the Parent pill set local state and teach SignupFlow
the parent copy, then delete /parent-signup.

---

## 2026-11-14 — `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` added to .env.local

**Decision.** Appended to the local env file so the Google button renders in
local dev, matching what production will be.

**Why.** It was needed to verify the button actually appears with the flag
on — and finding that it appeared with the flag OFF is how the guard bug was
caught. The file is gitignored; nothing is committed.

**How to undo.** Delete the line.

---

## 2026-11-14 — Self-host all six font families, not the three named

**Decision.** The overnight brief named Inter, Inter Tight and JetBrains
Mono. I self-hosted those plus Cormorant Garamond, Space Grotesk and IBM
Plex Mono — every family `app/layout.tsx` loads.

**Why.** The point of the task is that the build makes no network call. Three
of six still fetching from Google leaves the failure exactly where it was,
just less often — and "builds 3× in a row" would have been luck, not proof.
The other three are Legacy concept-theme faces (P1-UX-2 will delete them with
Legacy); self-hosting them costs 112 KB of committed woff2 and removes the
last build-time dependency.

**How to undo.** Put the `next/font/google` imports back in
`app/layout.tsx` and delete `app/fonts/`. The CSS variable names are
unchanged, so nothing else moves.

---

## 2026-11-15 — CORRECTION to the entry below: it is 25 advisories, not one

**What I got wrong.** The entry below describes the remaining `next`
vulnerability as the Image-Optimizer `remotePatterns` DoS and concludes "both
currently unreachable". `npm audit --omit=dev --json` shows the `next`
finding bundles **25 separate advisories** — 3 critical, 9 high, 11 moderate,
2 low. I read the first one `npm audit` printed, verified its two checkable
sub-claims, and generalised to the bundle.

The two sub-claims are still true — no `remotePatterns`, zero `next/image`
imports, both re-verified. They just do not cover the other 24. Several are
squarely in scope for a Vercel-hosted App Router app: cache confusion of
response bodies, cache poisoning in RSC responses, unauthenticated disclosure
of internal Server Function endpoints, DoS in App Router via Server Actions,
XSS in App Router apps using CSP.

**What changes.** "Both currently unreachable" is withdrawn. The `next@16`
upgrade moves from Week 1 to **the top of Week 1, before the first paying
customer**, and `docs/TODO.md` is updated. It is still not a tonight job —
it is a major with App Router breaking changes, and doing it unreviewed at
midnight would be worse than the exposure.

**How this happened**, because the pattern matters more than the entry: I
verified the first item and asserted the set. The same shape as the
`family_code` INSERT hole found hours earlier — check one path, assume the
rest, write the assumption down as a finding. Found by an independent
verifier running `npm audit --json` rather than reading the summary line.

---

## 2026-11-14 — Leave the Next.js critical and the postcss high unfixed

**Decision.** Production dependencies went 5 vulnerabilities → 2. The two
that remain (`next` critical, `postcss` high) are only fixable by upgrading
to `next@16`, a major. Left in place, documented, not forced.

**Why.** The brief ruled out a major Next/React upgrade tonight. Both are
also unreachable in this app, which is the part worth checking rather than
assuming:

- **`next` — DoS via Image Optimizer `remotePatterns`.** We configure no
  `remotePatterns` (`grep remotePatterns next.config.mjs` → 0), import
  `next/image` in **zero** files, and deploy on Vercel rather than
  self-hosted. The advisory is specifically about self-hosted apps.
- **`postcss` — XSS via unescaped `</style>` in stringify output.** postcss
  runs at build time over our own CSS. No user input reaches it, and nothing
  ships postcss to the browser.

`next@14.2.35` is already the newest 14.2.x, so there is no patch inside the
major.

**How to undo.** `npm i next@latest eslint-config-next@latest` and fix the
breaking changes. Tracked in docs/TODO.md.

---

## 2026-11-14 — Remove `geist` and `pdf-lib`

**Decision.** Uninstalled both.

**Why.** Zero references anywhere outside `package.json` — checked across
`.ts`, `.tsx`, `.css`, `.mjs` and `.json`. `geist` is a font package the app
never used (it has its own faces); `pdf-lib` was presumably for a report
export that was never built. Unused dependencies are attack surface and
audit noise.

**How to undo.** `npm i geist pdf-lib`.

---

## 2026-11-14 — Remove the CI build retry

**Decision.** `.github/workflows/ci.yml` runs `npm run build` once.

**Why.** The three-attempt retry existed only for the Google Fonts flake,
which no longer exists now the fonts are local. A CI that passes on the
second attempt teaches people to re-run rather than read the failure.

**How to undo.** Restore the loop from git history — but if the build is
flaking again, find out why first.

## 2026-11-15 — `playwright-core` + axe as devDependencies, driving the installed Chrome

**Decision.** Added `playwright-core@1.49.1`, `@axe-core/playwright@4.10.1`
and `axe-core@4.10.2` as devDependencies (`@axe-core/playwright` was removed
on 2026-11-20 in PR-QUALITY: nothing in the repo imports it; the scripts
inject `axe-core`'s own file), installed with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and pointed at the Chrome already on
the machine (`channel: "chrome"`).

**Why.** TASK B needs real `/family` screenshots taken through a real
sign-in, and TASK D needs keyboard walkthroughs, axe runs and before/after
mobile measurements. The in-app browser pane could not do it: it scales an
emulated 1440px viewport into an ~800px pane and mis-composites
`position: fixed` elements, which produced a screenshot showing the sidebar
overlapping the page content when the DOM geometry proved there was no
overlap (`aside` 0–232, `main` from 248). Evidence that is an artifact of
the capture tool is worse than no evidence.

**Cost checked, not assumed.** `npm audit --omit=dev` still reports **zero**
production vulnerabilities after the install, so TASK A's result stands. No
browser binaries were downloaded.

**How to undo.** `npm uninstall -D playwright-core @axe-core/playwright
axe-core`. Nothing in `app/`, `components/` or `lib/` imports them; the
capture script lives in the session scratchpad, not in the repo.

## 2026-11-15 — a null UTR renders "Not tracked"; `Player.currentUTR` keeps its type

**Decision.** Made the *family* UTR path nullable
(`FamilyMember.currentUtr`, `buildSeasonBudgetSummary`,
`pendingSkipDecisions`) and had the four family views print "Not tracked".
Left `Player.currentUTR: number` and its `emptyPlayer` placeholder of 7
alone.

**Why.** The bug was that `/family` showed "7.0 UTR" for an account whose
`current_utr` is NULL — the placeholder leaking onto a screen through
`playerMember?.currentUtr ?? player.currentUTR`. The root-cause fix in the
purest sense is `Player.currentUTR: number | null`, but that type has **79
read sites across 26 files**, most of them inside fit maths that CLAUDE.md
specifically warns must never receive a non-number
("Never pass `undefined` as the projection to `classifySchoolFit`"). A
79-site type change through the fit engine, at 1am, with the launch
rehearsal still ahead, trades a contained honesty bug for an uncontained
correctness risk.

The nullable boundary is drawn exactly where the unknown value enters a
screen. `classifySchoolFit` is never called with a substituted number — the
projection is null and the section is skipped.

**How to undo.** Revert the commit. **What to do instead, properly:** make
`Player.currentUTR` nullable and let the compiler find all 79, with the fit
engine's own null handling (`lib/fit.ts:94` already returns null for a null
UTR) as the pattern. That is a focused piece of work, not a 1am one.

## 2026-11-15 — did NOT widen cross-user reads to fix the joined-player gap

**Decision.** Found that a parent cannot read an approved joined player's
profile or UTR history at all (their `profiles.family_code` stays NULL and
both read policies require it non-null). Wrote it up in `docs/TODO.md` with
the evidence and three candidate fixes; did not change any policy.

**Why.** Every candidate fix widens what one user may read about another
user who is a minor. 027 and 030 each took a full attack-test pass in both
directions before being believed, and the same is owed here. It is also not
obviously a bug rather than a deliberate choice — 032 exists precisely
because claiming a family code is a takeover vector, so there may be a
reason 023/026 left the joiner's `family_code` NULL. Finding out is step one
of the fix, and it is a reading task, not a typing task.

It denies access rather than granting it, so nothing is exposed by waiting.

**How to undo.** Nothing to undo — no change was made. The write-up is at
the end of `docs/TODO.md`.

## 2026-11-15 — the dress rehearsal ran on staging itself, not a fresh copy

**Decision.** TASK C asked for a staging *copy* at production's 23-migration
shape. I rolled the existing staging project backwards to that shape instead,
using the rollout plan's own rollback SQL in reverse order, then replayed
forward.

**Why.** The Supabase org is on the **free plan** and already has its two
projects (production + staging). A third project is not available, database
branching is a paid feature, and either would be a billing action taken while
the account owner is asleep — not something to do unattended.

**Why it turned out better anyway.** Running the real rollbacks against real
objects is what found three of the four defects in §J. A fresh copy built
from migration files would have exercised none of them: the rollback SQL
would never have run at all, and the fact that step 8's rollback raises
`42P13` before doing anything would still be undiscovered.

**What it cost.** The baseline is a rolled-back database rather than a
pristine one, so a few objects were recreated by hand and 4 of 9 fingerprint
categories differ from production in expression text (not in counts, and all
23 tables match column-for-column). Each difference was tracked to its cause
rather than waved through.

**How to undo.** Nothing to undo — staging is back in its full post-rollout
state. To redo it properly later, upgrade the Supabase org to a paid plan and
use a database branch, which is what this is for.

## 2026-11-15 — lighthouse added as a devDependency

**Decision.** Added `lighthouse@12.2.1` as a devDependency, driven headlessly
against the already-installed Chrome.

**Why.** TASK D asked for mobile Lighthouse before/after. My own
instrumentation (axe + the browser's performance entries) measures real
things but is not a Lighthouse score, and reporting it as one would be
inaccurate. Lighthouse also caught a rule my axe configuration missed
(`heading-order`, a "moderate" rule outside the wcag2a/wcag2aa tags), which
is the argument for using both rather than either.

**Cost checked.** `npm audit --omit=dev` still reports zero production
vulnerabilities.

**How to undo.** `npm uninstall -D lighthouse`. Nothing in the app imports it;
the runner lives in the session scratchpad.

## 2026-11-15 — robots.txt derives from one list, with justified exemptions

**Decision.** Replaced the hand-written disallow list in `app/robots.ts` with
`lib/seo/private-routes.ts`, and added a test that walks the app directory
and fails the build when an auth-gated route is crawlable.

**Why.** The hand-written list had silently drifted through a route rename:
it protected `/dashboard`, `/roadmap` and `/coaches` while `/today`, `/plan`,
`/outreach` and `/events` — the live routes — were crawlable. A list that
only a human updates will drift again at the next rename.

**The exemption mechanism is deliberate.** `/onboarding` renders an AuthGate
but is genuinely public, so it is exempted **with a written reason**, and the
test asserts every exemption names a real route that really does render a
gate. An exemption list that cannot quietly collect entries is safe; one that
can is just the old hand-written list with extra steps.

**How to undo.** Revert the commit; `app/robots.ts` goes back to its literal
array.

## 2026-11-15 — the placeholder UTR is 0, not 7, and the email omits it

**Decision.** `emptyPlayer.currentUTR` is `0`. The coach email omits the UTR
sentence, the subject fragment and the signature line when it is not real;
four display sites print "Not tracked"; the school range bar omits the "you"
marker rather than parking it at 0%.

**Why this time and not last time.** Last night I decided to leave
`Player.currentUTR: number` alone (79 read sites, 1am) and wrote in this file
that the result was "a contained honesty bug". An independent review then ran
`buildCoachEmail` and got "My UTR is 7.0 (self-reported)" for a player who
had never entered one. It was not contained: it shipped in an email a minor
signs their name to, which is P0-4 — the rule that every sentence in a coach
email traces to a value the player entered.

**Why 0 is not just a different invented number.** 0 is not a valid UTR (the
scale starts near 1), and `currentUTR <= 0` is ALREADY this codebase's
convention for "no real UTR logged yet" — `lib/fit.ts:94` returns a null
projection for it, and the note above `explainSchoolFit` describes it as
"the same `currentUTR <= 0` convention already used by the pre-auth
tournament-fit calculator". This aligns the placeholder with an existing
sentinel rather than inventing one.

**What is still deferred.** `Player.currentUTR` is still `number`, not
`number | null`. The sentinel makes the lie detectable at every site that
checks; making it unrepresentable is still the better fix and still a
79-site change.

**How to undo.** Revert the commit. `lib/db/schools.test.ts` fails if the
placeholder returns, and fails again if the email states a rating for it.

## 2026-11-15 — fixed the Criticals in a new migration, not by editing 032/033/034

**Decision.** 035 supersedes the three function bodies rather than amending
the applied migrations.

**Why.** 032, 033 and 034 are applied to staging and are already written into
the §J rollout as numbered steps with their own verify and rollback blocks.
Editing an applied migration in place means the file and the database it was
applied to no longer agree, and anyone reading §J afterwards cannot tell
which version ran. 033 already supersedes 032's function; 035 continuing that
pattern is the repo's existing convention.

**The cost, stated plainly.** The rollout is fourteen steps instead of
thirteen, and 032/033 must never ship without 035 — which is now stated in
bold in both steps.

**How to undo.** §J step 12's rollback.

---

## 2026-11-15 — Rehearse against production's data shape, not a tidy one

**Decision:** before launch, rebuild staging so that its nine-category schema
fingerprint matches production exactly (9 of 9), and seed it in production's
*data* shape — including the awkward parts — rather than in the shape that
makes the feature easy to reason about.

**Why.** Two earlier rehearsals passed. Both seeded a family as a clean
creator/joiner split: one person holding `profiles.family_code`, one person
holding an approved `parent_accounts` row, never both. Production is not like
that. **All three `parent_accounts` rows belong to users whose own
`profiles.family_code` is the same code**, from the pre-023 era when the app
wrote both, and one family has **four profiles sharing a single code**.

In the real shape, `family_members()` — a `UNION ALL` of the two membership
shapes — returned **9 rows for 6 people**, and `is_creator` (hardcoded `true`
for the whole `profiles` branch) labelled three removable members "account
holder" and hid their Remove button. The component's own comment asserted this
was "a real fact now". Neither earlier seed could express the input that makes
it false. Fixed by migration 038 and guarded by
`lib/db/family-roster-shape.test.ts`.

The same seed also corrected a claim in the rollout plan: 036's read gap does
**not** affect anyone production has today, because the old policy keyed off
the row owner's `profiles.family_code` and every current member carries it.
036's read half is a fix for future joiners; 037's narrowing is what changes
today's members. The write half was broken for real.

**Also decided: making the starting state exact is part of the rehearsal, not
tidiness.** The documented rollbacks restore BEHAVIOUR, not SCHEMA, so a
rolled-back database still carries 17 extra functions and 8 extra columns. A
forward run from there cannot prove a `CREATE` would have succeeded on
production, because the object already exists — and it is how 025 kept being
asserted to be a no-op instead of measured as one. With the fingerprint at
9 of 9 first, applying 025 left it at 9 of 9: proof rather than assertion.

**Cost:** the third rehearsal took longer than the first two combined, mostly
in rebuilding the starting state. It found a user-visible bug that was one
merge away from production, three more rollback gaps, and one false claim in
the launch notes. Do it this way again.

**Rejected:** creating a brand-new Supabase project per rehearsal. Cleaner in
principle, but it would not reproduce production's *drift* — the whole reason
025 exists and the reason the repo cannot build production from `0001` alone.
Rolling the existing clone back and then removing the leftovers reproduces both
the schema and the history.

---

## 2026-11-15 — Launch UI polish: four of the sixteen items were honesty bugs, not polish

A premium UI/UX + PM review of the `v1` preview (dpl `7291c17`) returned 16
items, split P0/P1. Four of the P0s are not cosmetic and would have been
launch blockers under this repo's own rules:

- **`/schools` computed every fit band against the UTR sentinel.** A
  logged-out visitor saw "Reach 37 · Target 0 · Likely 0" and "You 0.0" on
  all 37 rows. `hasRealUtr()` already guarded the range-bar dot — someone had
  fixed half of it — but `countSchoolFits`, `classifySchoolFit`,
  `explainSchoolFit`, the sort and the row caption were all unguarded, and
  the caption interpolated `effectiveUtr.toFixed(1)` unconditionally. This is
  precisely the failure the CLAUDE.md placeholder section was written about
  after the last one.
- **`/pricing` sold "Weekly training plan."** Seeded does not generate
  training plans; "manual calendar only" is a non-negotiable.
  `lib/copy-honesty.test.ts` existed and did not cover it.
- **`/pricing` badged Free as "Current plan" to logged-out strangers**,
  because `useTier()` returns `"free"` for signed-out and signed-in-free
  alike and nothing checked which.
- **Program counts disagreed** — 68 on `/pricing`, 37 rows on `/schools`.
  Both numbers were true (68 is the catalogue, 37 is the men's half) and
  neither sentence said which, so together they read as a broken promise.

**Decided: the counts come from `getCatalogCounts()` and are labelled by
gender.** Computed on the server so the catalogue stays out of the client
bundle, and `lib/copy-honesty.test.ts` now fails the build on a literal
count in copy.

**Decided: the line on "training plan" is who makes the plan.** Seeded
promising to produce one is banned. The word inside `/training`, where a
player groups their own sessions, is left alone — renaming it there would
hide rather than fix the real open violation (the auto-generating setup
wizard, TODO #2).

**Decided: the CTA band uses fixed colours, not theme tokens.** The first
fix (ink button on the green band) measured 2.77:1 in light and 1.79:1 in
dark, because `bg-ink` and `bg-grass` BOTH invert between modes — two
mode-flipping tokens cannot be relied on to stay apart. It is now the same
always-dark panel treatment the parents section already uses, measuring
14.24:1 / 14.53:1.

**The header bug was not "not enough room".** The nav had `flex-wrap` and
two `flex-1` children — the links list and an empty `aria-hidden` spacer —
so the links were handed exactly half the free space: a 360px box holding
~480px of links, next to a 360px box holding nothing, on every page at every
desktop width.

**Lesson, and it cost a pass to learn:** the first audit run reported 0 axe
violations and photographed three blank bands. A `fullPage` screenshot never
scrolls, so `whileInView` sections had not rendered — the audit was
measuring a page that did not exist. Scrolling first turned 0 violations
into 2 real ones. **A clean result from a harness you have not watched work
is not a clean result.**

**Also: a brand-new visitor's first paint follows their OS.**
`systemSync` defaults to true, so light and dark are both "the default" and
contrast has to be measured in both. The first audit forced light and would
have shipped a dark-mode contrast failure.

---

## 2026-11-15 — Two adversarial passes, seven guards defeated, and what that says

Two independent verifiers, run back to back against the same branch. Between
them they defeated **six of the guard tests written in this session**, three
on each pass, and found a false claim in **every** commit message of this
round. The pattern is consistent enough to be worth writing down.

**Every guard that failed, failed the same way: it checked a SPELLING, not a
PROPERTY.**

- "no `countSchoolFits` without a gate" — so a band badge rendered
  ungated instead.
- "a `hasUtr ?` within 300 characters of the caption" — satisfied by a
  neighbouring `hasUtr` on the line above.
- "`classifySchoolFit` is called once, behind `hasUtr ?`" — satisfied by
  `hasUtr ? effectiveUtr : player.currentUTR`, which is gated and still
  wrong.
- "`| null` in the return type" — satisfied by an annotation on a function
  that never returned null.
- "no UI file calls `generatePersonalizedPlan(`" — so a file passed it
  around as a value, then a NEW file in an unscanned root imported it.
- "a number followed by programs/schools" — so the copy said "teams".
- "`date we checked`" — so the copy said "date we **last** checked".

**Decided: a guard must assert something the compiler can be made to
enforce, or it is a lint and must say so in its own name.** The ones that
now hold do it by removing the capability rather than policing it:
`classifySchoolFit` can only be handed `youUtr`, which is `number | null`,
so the fallback that broke it does not typecheck; `generatePersonalizedPlan`
is not exported, so no module can import it regardless of which roots a test
walks. Both defeats now fail `tsc`, not just `vitest`.

**Decided: scan `lib/` too.** Two separate defeats used it — `/privacy`'s
entire body lives in `lib/legal/policy.ts`, and a one-file helper in `lib/`
re-reached the generator. A scan whose roots are `components` and `app` is
not scanning the application.

**Decided: a comment describing a regex is not the regex.** The count
pattern's own comment claimed it covered "teams"; it never did, and a
verifier shipped a hardcoded count through that exact gap.

**The uncomfortable one.** Three commit messages in this round asserted
fixes that were not made: a `/methodology` check-date claim "fixed" in one
of three places, a colour that was never changed, a test file that does not
exist, and a behavioural justification for keeping the setup questionnaire
that nothing in the code supports. None of these were caught by tests,
review, or self-checking — only by someone adversarial reading the diff
against the running app. **Write the claim from the measurement, not the
intent.**

**Also decided: verify the verifier.** One HIGH was reported as "/pricing
sells a Weekly family report but the table is monthly and nothing writes
it". The table really is monthly and unwritten — but the weekly report does
not read that table. It computes live from the family's own logged data on a
genuine 7-day window. The claim on /pricing was accurate; the one that was
false was in `/privacy`, which described the unused table as something
Seeded writes. Taking the finding at face value would have removed true copy
and left false copy in place.

---

## 2026-11-15 — The fit report had two band systems; now it has one

`/onboarding` for Men's UTR 8.7 Class of 2031 showed a trajectory panel
saying "0 today → 20 by junior year", a headline saying "0 programs", tabs
saying "Reach 37 · Target 0 · Likely 0", and rows comparing 8.7 to each
team's range — all on one screen. Every number was correct about a
different question and nothing said they were different questions.

**Cause:** two parallel band systems — `countBands` in lib/fit.ts and
`countSchoolFits` in lib/school-fit.ts — each callable from any component
with whatever rating that component happened to hold.

**Decided: the rating is a decision, not a parameter.** `recruitingTimeUtr()`
is the only place that chooses which UTR judges fit. Before junior year it
projects; for a junior or senior it returns today's rating unchanged, at
every pace, because projecting growth onto someone being recruited now
invents a better player than the one coaches are watching.

**Decided: enforce it in the type system.** `classifySchoolFit` takes a
branded `FitBasis` whose brand is a `unique symbol` private to its module,
so a component cannot build one and `classifySchoolFit(8.7, school)` does
not compile. The previous two rounds showed what lint-level guards are
worth here: six were defeated by plausible edits. Making the change
surfaced 50 compile errors across 13 files — every one a place that had
been quietly choosing its own rating.

**Decided: "in range" means target + likely.** It was the trajectory
panel's existing meaning, and it is the honest one: a Reach is by
definition a program you are not yet competitive for.

**Decided: the junior-year view keeps a residual slow-pace curve to senior
summer.** A flat curve was the first attempt and made Reach impossible in
that view — toggling showed Reach going 37 → 0, reading as "I lost all my
reaches" rather than "those became targets". The window between junior year
and senior summer is real; taking the slow end of the band keeps it a floor
rather than a promise.

**Four of the five bugs fixed here were found by walking a persona, not by
a test** — including the headline still announcing "By junior year…" while
the Today view was selected, which is the original conflation reintroduced
by the toggle built to remove it. The consistency test now covers all five
personas in both views, but it was written after the walkthrough found the
problems, not before.

---

## 2026-11-15 — "What-if school planner" is free, because it already was

The pricing compare table listed it as Player-only. Nothing gates it: it is
client-side arithmetic over the public school catalogue, with no database
write for RLS to refuse. The only way to withhold it would be a client-side
check, and CLAUDE.md is explicit that `AuthGate`/`PaidGate` are cosmetic and
the database is the real control.

**Decided: correct the table rather than add a cosmetic paywall.** A
paywall that cannot be enforced is a claim, not a feature, and this project
has spent two rounds removing claims the code does not back.

The alternative — actually withholding it — would mean either shipping a
gate the project's own rules call decorative, or moving the computation
server-side, which is a new feature on launch week. Neither is worth it for
a slider.

Everything else in the table was checked against `FEATURE_TIER` and the
migrations behind it and is accurate: outreach and the plan at Player
(migration 024/019), the parent dashboard, season budget and weekly report
at Family, and the catalogue, estimates, school pages, tournament checker
and three saved targets on Free.

---

## 2026-11-15 — RLS is a ceiling, not a scope

`/family/weekly-reports` told a parent their child's UTR had fallen 4.40
points in a week. The tile's number was the child's; its delta was the
parent's own rating minus the child's. Two people, subtracted.

`loadUtrEntries()` was a bare `select` with no user filter, and the comment
above it explained why: *"utr_entries' RLS policy is exactly
`auth.uid() = user_id`, so there's nothing to gain from filtering
client-side."* True when written. **Migration 036 made it false** —
`utr_entries_select_family` lets approved family members read each other's
rows — and nothing failed, because a query that returns too much still
returns.

**Decided: every query states its own scope, regardless of RLS.** RLS is a
ceiling on what a caller MAY read; it is never a statement of what the
caller MEANT to read. Widening a policy must not silently widen every query
that relied on it.

**Decided: reading another user's data gets its own named function.**
`loadUtrEntriesFor(userId)` exists so that a caller has to choose it. The
failure mode here was not a wrong filter — it was no filter at all, inherited
by forgetting.

**Also decided: a guard pattern containing an apostrophe is broken by
default.** JSX escapes them, and this codebase writes `men&apos;s` and
`We&apos;ll` everywhere. Two separate verifier mutations — a hardcoded
catalogue count and an email promise — shipped past guards written and
widened specifically to catch them, purely on the escaping. `copy-honesty`
now decodes entities before matching.

**And: four of this pass's findings were bugs in the harness, not the
product** — a 400 on every page from rebuilding without restarting the
server, 169 phantom tap targets, blank screenshots from never scrolling, and
a horizontal-scroll report on a page that does not scroll. Every one would
have been reported as a product defect. Measure the thing a user
experiences: try to scroll, rather than reading `scrollWidth`.

## 2026-11-19 — One Family plan covers one family: up to 4 players and 2 parents

**Owner's decision (Niran), final.** 042 unlocked a family when ANY approved
member held the Family plan, and a member counts in every family they are
approved in — so one subscription could unlock any number of families (the
PR B review proved it on staging with a payer approved into a second family).

**Decided: RESTRICT.**
- A Family plan unlocks exactly one family: the one the paying account
  currently belongs to (`home_family_code()`: its own `family_code`, else its
  earliest approved link — the same rule as `my_family_code()`, which now
  calls it). A payer who leaves takes the unlock with them.
- A family holds at most **4 players and 2 parent accounts**. Over the cap
  the extra account cannot join or be approved, and is told "This family
  already has 4 players. Contact support@seededtennis.com". **Existing
  members are never removed**, even in a family already over the cap.
- Enforced in the database (migration 045: `family_has_tier`, `join_family`,
  `approve_family_join`), not in the screens. /pricing, the Family card, the
  compare table, the FAQ, the paywall and /privacy say "For one family: up to
  4 players and 2 parents", from constants `lib/family-plan-scope.test.ts`
  pins to the SQL.

**Not decided here:** whether support can raise a family's cap. Today nothing
can, short of a migration; "Contact support" means a person reads the email.

## 2026-11-19 — Rollout decisions (S2, comps, nav)

- **S2:** production's 28 generator-made workout sessions stay hidden (PR C),
  not deleted. Revisit on or after 2026-12-19.
- **Comps:** none. Family NIRAN-0LK2 is the owner's own test family and is
  expected to see the paywall.
- **Nav:** the "Tools" group (Results, Tournament checker) under the five
  primary items is approved.
- **`/auth/verified`:** covered by the existing `https://seededtennis.com/**`
  redirect allow-list entry in Supabase Auth; no dashboard change.

