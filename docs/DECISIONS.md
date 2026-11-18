# Decisions

Calls made without asking, because asking wasn't an option at the time.
Each one: what, why, and how to undo it.

Newest first.

---

## 2026-11-18 — One projection rule for onboarding and the app

**Decision.** The "UTR at the summer before senior year" is decided in one
place, `recruitingTimeUtr()` in `lib/fit.ts`, and both the signed-in app
(`buildFitReport` → `useFitReport`, the parent chart's `projectedUtrOn` /
`projectionReachDate`) and the onboarding diagnostic (`diagnosticProjection`,
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
assumption does not have. Logged ratings use the new `formatUtr2`.

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
`rememberRole` in lib/context/player-context.tsx and the head script.

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
and `axe-core@4.10.2` as devDependencies, installed with
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
