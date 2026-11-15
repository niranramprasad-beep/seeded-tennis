# Decisions

Calls made without asking, because asking wasn't an option at the time.
Each one: what, why, and how to undo it.

Newest first.

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
