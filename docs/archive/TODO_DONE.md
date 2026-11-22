# TODO — done and obsolete items (append-only)

Items moved out of [`../TODO.md`](../TODO.md) once they were done or
overtaken. **Moved verbatim**: the text is exactly as it stood in `TODO.md`
(headings demoted two levels to fit here), so "open", "tonight" or "Week 1"
inside an item means as of the day it was written. Each block says why it
moved. Newest move first; add a new `## Moved YYYY-MM-DD` section at the
top when you close something. For what is open now, read `TODO.md`.

## Moved 2026-11-22 (`chore/docs-organize`, from `main` @ `00ba20f`)

### The old header of `TODO.md`

Replaced by a new header; `MASTER_ROADMAP.md` is no longer "the full
picture" (its history is `archive/ROADMAP_HISTORY.md`).

### Seeded — TODO

Short, ordered, and about *what happens next*. `docs/MASTER_ROADMAP.md`
stays the full picture with acceptance criteria; this file is the queue.

Last updated 2026-11-19.

---

### From "WEEK 1 — ranked"

The section heading and the Family-subscription decision. Why: one plan =
one family shipped as migration 045, on production since 2026-11-19
(HANDOFF §J Step 20). The rest of that list's open items are in `TODO.md`.

#### WEEK 1 — ranked (written by the 2026-11-15 overnight pass)

**Open after PR B (2026-11-18) — Niran's calls or dashboard steps:**

- ~~**One Family subscription unlocks any number of families.**~~ **Decided
  2026-11-19: RESTRICT** — one plan unlocks the payer's home family only, and a
  family holds at most 4 players and 2 parents. Migration 045 (HANDOFF §J
  Step 20); copy on /pricing, the paywall and /privacy.

"Billing honesty". Why: overtaken by migration 042 (production 2026-11-19),
which locks the Family plan in RLS — a family without the plan cannot read
another member's rows or read/write the budget, notes or reports (CLAUDE.md
"042 locks the Family plan in RLS"; guard `lib/db/family-plan-lock.test.ts`).

**Billing honesty — needs Niran's call (found 2026-11-16 rebuilding /pricing):
the Family plan unlocks nothing the code enforces.** `FEATURE_TIER`
(lib/types.ts) marks the parent dashboard, season budget and weekly report as
Family-tier, and /pricing's compare table is generated from it — but no RLS
policy calls `has_tier('family')` for them, `/family*` is not behind
`PaidGate`, `lib/route-access.ts` checks role only, and budget writes check
`is_parent_member()` with no tier. A parent on Free gets all three today.
Either gate them (PaidGate on /family* + `has_tier('family')` in the budget /
report policies — a migration, and it takes access away from today's free
parents) or change `FEATURE_TIER` and the Family card (the table follows
automatically). Not changed in the UI polish PR because either fix changes a
live flow or what people are paying for.

The heading of items A and B. A and B themselves are still open and stay in
`TODO.md` (§2).

**Do these two first — both are migrations, so neither ships in the UI
polish PR (Niran, 2026-11-16):**


Items 2–7. Why, one each: **2** the premium diagnostic onboarding shipped
with PR B (migration 041, production 2026-11-19); **3** is the same item as
B, which stays open in `TODO.md`; **4** done by migration 050; **5** the
generator, templates and planner were deleted 2026-11-18
(`lib/training-no-autogen.test.ts`); **6** grade and gender now start
unanswered (`lib/no-default-answers.test.ts`); **7** Legacy deleted
2026-11-20 (PR-LEGACY).

2. **PREMIUM DIAGNOSTIC ONBOARDING** (Niran, 2026-11-16) — one question per
   screen, progress bar, under 90 seconds: current UTR; UTR about 6 months
   ago (optional, "not sure"); UTR about a year ago (optional); team; grad
   year; planned college enrollment term (gap year / reclassify); birth
   MONTH + YEAR (not a full date of birth — data minimisation for minors);
   GPA (optional). Use the player's real growth rate from the past ratings
   when given, and fall back to the labelled assumption otherwise. Honest
   "Estimate" labels throughout. (Builds on tonight's change: the
   projection already targets the summer before senior year in one place,
   `projectionTargetDate()` in `lib/fit.ts`.)
3. **Role-gate the player tables' INSERT policies** (migration). A parent
   can still log a UTR/match/event under their OWN id by calling PostgREST
   directly; the app's routes refuse it (403) and no family screen reads a
   parent's rows as the player's, but RLS allows it. Mirror 033: require
   `profiles.role = 'player'` in the WITH CHECK of utr_entries, matches,
   tournament_entries, coach_outreach, the training tables, daily_checkins.
   Attack-test a parent refused and a player allowed, on staging first.
4. ~~**`is_parent_member()` role-aware**~~ — DONE, migration 050 (2026-11-20).
5. **Delete `generatePersonalizedPlan()`** (already listed below).
6. **Onboarding's Grade and gender defaults.** Tonight made the UTR an
   explicit choice; the same signed-in onboarding still preselects 10th
   grade and men's. They are visible choices the player confirms, not silent
   defaults, but they produce a graduation year and a growth curve the
   player never chose if they click through.
7. ~~**Delete Legacy (P1-UX-2).**~~ **DONE 2026-11-20 (PR-LEGACY,
   `chore/delete-legacy-theme`).** Every Legacy view, palette, font and
   switch is deleted; its four routes are server redirects;
   `lib/no-legacy-theme.test.ts` fails the build if any of it returns. The
   one follow-up is the optional cleanup migration under "Smaller things".

Item 10. Why: the same item as A ("See item 10 below, which this
replaces"), which stays open in `TODO.md`.

10. **What an under-13 awaiting consent can read** (independent verifier,
    2026-11-16). RLS keeps a pending account out of 21 tables, but
    `family_members()` is SECURITY DEFINER and returns the family's members
    — names, emails, ratings, targets — to any approved member, consent
    pending or not. It is inside their own family, so not a leak, but it is
    more than "inert". Decide whether `family_members()` should return
    nothing (or names only) while the caller's `consent_status = 'pending'`;
    that is a migration. The copy no longer claims "reads nothing".

Item 14. Why: done 2026-11-16, as it says.

14. ~~**A parent's /schools shifts on a phone.**~~ **DONE 2026-11-16
    (PR A, `fix/ui-polish-1`)** exactly as proposed: `seeded.role` in
    localStorage (set by one effect in player-context on every sign-in path,
    cleared on sign-out), `html[data-role]` from the head script, and
    role-sized placeholders — plus the band chips and fit column held while
    a parent's roster loads. Measured with a layout-shift probe: persona f
    0.0001 / 0.0004 / 0.0034 and persona a 0.0001 / 0.0004 / 0.0021 at
    320 / 375 / 1440 (were up to 0.29 for f mid-PR, 0.13–0.20 for a before).

Item 13. Why: documented — `lib/route-access.ts` now says why `/family` is
on the pending-consent list (a pending under-13 sees who they are waiting on
and can fix a mistyped code).

13. `isConsentPendingAllowedPath` lists `/family`, but players are blocked
    from `/family` first, so the entry does nothing. Remove it or document
    why it is there.

### "Blocking the production rollout" — the whole section

Why: the rollout ran on 2026-11-16 (`archive/ROADMAP_HISTORY.md`,
HANDOFF §J Steps 1–15).

#### Blocking the production rollout

##### 1. ✅ Family linking — DONE (2026-11-14), staging only
`completeFamilySignup()` uses `join_family()` only; 023 + 026 applied and
end-to-end tested on staging (30/30). Ships as one unit with those two.

##### 2. ✅ Vercel Preview + local Development on staging — DONE (Niran, 2026-11-14)
All three Supabase vars are Production-only; Preview and Development carry
their own, pointing at `gnlcpnsweqbtwpaqhqqg`. Verified read-only from the
project's env config. **One caveat:** the newest `v1` preview deployment
was built ~2 hours BEFORE that change, so it is still talking to
production. The next push to `v1` produces the first preview that actually
reads staging — worth confirming on that build rather than this one.

Niran also found and fixed something worse while doing it: preview deploys
were using the **production** service-role key.

##### 3. ✅ Branch protection on `main` — DONE (Niran, 2026-11-14)
Ruleset "Protect main": PR required, `verify` required, force pushes
blocked. **Work with it, never around it.**

##### 4. ✅ Credentials — DONE (Niran, 2026-11-14)
`GEMINI_API_KEY` deleted from Vercel; Stripe was never used; the Whop key
was verified never committed, so no rotation was needed.

##### 5. The rollout itself
Nine migrations, in order, then the code:
`025 → 022 → 023 → 026 → 024 → 027 → 028 → 029 → 030 → 031`, then revert
the maintenance commit and merge `v1` → `main`. Every step has a verify
and a rollback in `docs/HANDOFF.md` §J. **Waiting on Niran's "go".**

Highest-blast-radius step is 8 (030 + 031): it adds a restrictive policy to
21 tables. Its pre-flight check — every existing row `consent_status =
'not_required'`, zero `'pending'` — is the one that must not be skipped.

---

### From "Still open after the rollout"

Items 7 and 11. Why: done, as each says.

7. ✅ **People who asked to be deleted under the old flow — none.** Checked
   read-only on production 2026-11-14: `select count(*) from profiles where
   deletion_requested_at is not null` returns **0**. Nobody is owed a manual
   deletion. §J step 7's check stays in the plan because it is cheap and the
   answer could change before the rollout.
11. ~~**P1-UX-2** — delete Legacy.~~ DONE 2026-11-20 (PR-LEGACY).

### From "Billing — before launch"

Why: the middleware item was moot and the soft 404 fixed, as each says; the
`generatePersonalizedPlan()` item is done — the generator, the templates and
the /training planner were deleted on 2026-11-18 (CLAUDE.md "No
auto-generated training plans"); the `is_parent_member()` item was done by
050 (2026-11-20).

- [x] ~~Let `/api/whop/webhook` through the maintenance middleware on
      `main`~~ — **moot, and worth knowing why.** The matcher change was
      only ever needed because the merge plan kept the maintenance
      middleware alive on `main`. It doesn't: `middleware.ts` is deleted on
      `v1` (commit below this one), so after the merge there is no
      middleware on any path and the webhook answers normally. The replay
      therefore waits on the deploy, not on a matcher.
- [x] **Soft 404 on unknown school slugs — FIXED 2026-11-15 overnight** (`dynamicParams = false`; verify on the next preview that `/schools/not-a-real-school` returns 404). `/schools/<anything>` returns
      HTTP **200** with a page titled "School not found — Seeded" (measured on
      the f0f2919 preview). Google indexes a 200, so junk slugs can become
      indexable pages. Low risk today — nothing links to them and the sitemap
      lists only real pages — but the honest status is 404. P2; `robots.txt`
      does not disallow `/schools/`, so if this is left, consider whether it
      should.
- [ ] **WEEK 1, ITEM #2 — delete `generatePersonalizedPlan()` itself.**
      CLAUDE.md: "No auto-generated training plans — manual calendar only."
      **The UI half is DONE (2026-11-15, Niran's call):** the
      "Generate my training week" button is gone, and finishing the setup
      questionnaire now stores the player's preferences and nothing else —
      it used to write a whole week of invented sessions ("Serve plus
      first-ball patterns", "Filmed set play") that the player had never
      asked for and could not tell apart from their own.
      What is left is deleting the ~90-line generator in
      `components/training/training-view.tsx`, kept for now so that diff is
      reviewable on its own. `lib/training-no-autogen.test.ts` fails the
      build if any UI file so much as names it — mutation-tested six ways,
      including passing it around as a value and aliasing it.
      **Companion question for the same pass:** the setup questionnaire is
      now a three-question gate whose answers are read in exactly one live
      place — `buildTemplateSessions()`, which only runs if the player opens
      the Templates drawer. Nothing beside the calendar shows the hours,
      goal or constraints they entered. Either surface them or stop asking.
      (A commit message in this round claimed the answers "drive the hours
      and constraints shown beside the calendar". They do not; that was
      measured and the claim was wrong.)

      **Related question for the same pass:** `buildTemplateSessions()` also
      writes sessions Seeded wrote, though only when a player explicitly
      picks a template. That is a defensible reading of "manual" and it is
      not what the rule was written about, but decide it deliberately rather
      than by omission.

- [x] **DONE 2026-11-20 (migration 050, PR-SEC) — WEEK 1, ITEM #1 — make `is_parent_member()` role-aware.** Kept below for the record. Niran's
      call on 2026-11-15: not a launch blocker, disclosed in `/privacy`
      instead, no migration on launch day. `is_parent_member()` returns true
      for any approved `parent_accounts` row regardless of `profiles.role`,
      so **an approved sibling PLAYER can insert and update the season budget
      and its expenses.** Measured twice, through the app's own supabase-js
      client and again by an independent verification pass — not inferred.
      The fix is a copy of 033's pattern: require `profiles.role = 'parent'`
      AND approved membership, in the WITH CHECK on `season_budgets` and
      `budget_expenses`. Attack-test both directions on staging first (a
      parent must still write; a sibling must be refused `42501`), then
      delete the disclosure sentence from `lib/legal/policy.ts` in the SAME
      commit rather than rewording around it. Check `pg_policies`, not this
      file. The sibling note write is already correctly refused — 033 holds.

### From "Dependency debt"

Why: `next` is on 15.5 (DECISIONS 2026-11-15); the postcss line reasons
about `next@14.2.35`, which is gone; the dev-only counts are stale — the
current line (23 dev-only, 0 in production; DECISIONS 2026-11-22) is in
`TODO.md` §7.

#### Dependency debt

- ✅ **DONE 2026-11-15: `next` upgraded 14.2.35 → 15.5.29.** All 25 advisories
  cleared; production dependencies are now at **zero** vulnerabilities (a
  postcss override handles the copy bundled inside next). See
  `docs/DECISIONS.md`. The entry below is kept for the record of what the
  exposure was.
- ~~**`next` needs a major upgrade, and it is 25 advisories, not one.**~~
  3 critical, 9 high, 11 moderate, 2 low, bundled into a single `npm audit`
  finding. **Top of Week 1, before the first paying customer.** Several are
  in scope for a Vercel App Router app: cache confusion of response bodies,
  RSC cache poisoning, unauthenticated disclosure of internal Server Function
  endpoints, DoS via Server Actions, XSS in App Router apps using CSP. An
  earlier version of this entry said "both unreachable" on the strength of
  the first advisory only — see the correction in `docs/DECISIONS.md`.
  The two checkable sub-claims remain true (no `remotePatterns`, zero
  `next/image` imports) but they cover one advisory of 25.
- **`postcss` high** is build-time only (no `remotePatterns`, zero `next/image`
  imports, Vercel-hosted not self-hosted; postcss is build-time only over our
  own CSS) — reasoning and evidence in `docs/DECISIONS.md`. `next@14.2.35` is
  the newest 14.2.x, so there is no patch inside the major. Plan a
  `next@16` + `eslint-config-next@16` upgrade as its own piece of work, with
  the App Router breaking changes read first. **Week 1, not launch-blocking.**
- **Dev-only vulnerabilities remaining: 2 critical, 2 high, 8 moderate**
  (`vitest` → `vite` → `tinypool`, plus `brace-expansion`). Down from 3/6/8.
  Nothing here ships — it is the test runner and the linter. vitest 5 will
  not install without `--legacy-peer-deps` and is four majors of migration.
  Week 2, not launch-blocking.

### From "Smaller things worth not forgetting"

The heading (its items are spread across `TODO.md`), self-hosted fonts
(done 2026-11-15: the build no longer fetches Google fonts and CI's retry is
gone — `archive/ROADMAP_HISTORY.md`, "Reliability/Deploy"), and the old
staging seed (the `*@test.example` / `TESTFAMILYA` set is gone; the current
fake set is in `STAGING_PERSONAS.md`).

#### Smaller things worth not forgetting
- Self-host the `next/font` Google fonts. The build intermittently fails
  fetching them; CI retries 3× as a workaround (P2).
- Staging holds clearly-fake test users (`*@test.example`) and family
  `TESTFAMILYA`, left in place deliberately as seed data. `TESTFAMILYB` and
  three of those users were consumed by the deletion tests and are gone —
  that was the test.

### "A parent cannot read a JOINED player's data — FIXED"

Why: fixed by migration 036, on production since 2026-11-16.

#### ✅ A parent cannot read a JOINED player's data — FIXED 2026-11-15 (migration 036)

Niran's decision: a player who joins with the code and is approved has opted
in, so approved members of that family may read that player's data, exactly
as in the player-first flow. Nobody outside the family, no pending members.

Fixed by migration **036**, `lib/db/family-scope.ts`, and eight call sites in
five files. Attack-tested on staging in both directions — stranger, pending
member, other family, removed member — plus the two write paths. Full
write-up in `docs/DECISIONS.md`; rollback in `docs/HANDOFF.md` §J step 13.

**Two things this file got wrong, recorded because the next person will read
it before the migration:**

1. It said "`matches`, `coach_outreach` and `tournament_entries` carry their
   own `family_code` column and do not have this problem." **Wrong.** True in
   the player-first flow (the player is the creator, so the stamp is right)
   and false in the parent-first one, which is the ordinary flow. Those rows
   were stamped NULL and no family member could read them.
2. It framed this as read-only. It was not: **a parent who joined with the
   code could not write either of the two things parents are allowed to
   write.** `encouragement_notes` / `season_budgets` / `budget_expenses` all
   WITH CHECK on the row's `family_code`, and `is_family_member(NULL)` is
   false. Reproduced on staging as `42501`.

Suggested fix (1) in the old entry — "just set the joiner's
`profiles.family_code` on approval" — was the right instinct and the wrong
change: `remove_family_member()` only deletes the `parent_accounts` row, so
a removed member would keep the column and keep their access. That is now a
passing test rather than a worry.

### From "Who may approve a parent joiner"

Why: migration 052 is on production since 2026-11-22 (HANDOFF §J Step 27),
so the "built on staging, production pending" paragraph and the "MEDIUM,
open on production until 052 ships" gap are history. The still-open
follow-ups stay in `TODO.md` under the same heading.

**BUILT ON STAGING 2026-11-21 — migration 052 (`feat/parent-approval-rule`);
PRODUCTION PENDING Niran's go after the review** (GO-SEQUENCE row 27, HANDOFF
§J Step 27). "A parent of the family" = `parent_acts_for_family(user, code)`:
own role = 'parent' AND home family (`home_family_code()`, the rule
`my_family_code()` uses) = code. `approve_family_join()`: once the family has
such a parent (either shape), the approver must be one too (for the caller
this equals 050's `is_parent_member(code)`) or gets 42501
`parent_approval_requires_parent`; a family with no parent may still get its
first from a player; player joiners unchanged. `remove_family_member()`: takes
045's per-family lock, then removing a parent of the family needs a parent of
the family (42501 `parents_only_remove_parent`). The first version counted a
parent approved in ANY family, which an independent review showed locks a
family whose only parent's home is elsewhere (that parent can never act in
it); fixed before production. 043's email proof, 045's cap and lock, 030's
consent and 037's account-holder rule are kept. Probe (35 cases incl. the
multi-family one, all pass, rolled back) and a rollback rehearsal in
`~/seeded-evidence/sat-prereview/p015/`. Guard
`lib/db/parent-approval-rule.test.ts`. Client maps both codes to plain
sentences (`lib/db/family-join.ts`).

**MEDIUM, open on production until 052 ships.** 050 makes the budget parent-only, but "parent" is a role
chosen at sign-up and any approved member may approve a join
(`approve_family_join`, 026/045; a player approver needs no email proof). So
a sibling player can create a second account as a parent, request to join,
approve it themselves, and write the budget from it. Reproduced on staging
by the independent verifier (rolled back). Limits: the account is visible on
the roster and counts against the 2-parent cap (045).
Not fixed tonight because the obvious fix — only a parent may approve a
parent — breaks families whose only approved member is a player (a player
creates the family, then the parent joins). Options: (a) a parent joiner
needs a parent approver when one exists, else the account holder; (b) the
account holder must approve parents; (c) show "added by <name>" on the
roster and the budget. Decide, then mirror 033's pattern in a migration.

### "DONE (050, 2026-11-20): `is_parent_member()` is flatter than its name"

#### DONE (050, 2026-11-20): `is_parent_member()` is flatter than its name

_Fixed by `supabase/migrations/050_budget_writes_parents_only.sql`; the `/privacy` disclosure was deleted in the same commit. History below._

Deliberately left out of 036 — a write-authorisation change nobody asked for
does not belong in the launch migration.

`is_parent_member(code)` returns true for the caller's own profile with
`role = 'parent'` **or** for *any* approved `parent_accounts` link
regardless of role. `season_budgets` and `budget_expenses` write policies use
it, so **a sibling player who joined the family can write the season
budget**, which contradicts "parents can write exactly two things" in
CLAUDE.md and in `/privacy`.

The fix is the one 033 already applied to `encouragement_notes`: require the
writer's own `profiles.role = 'parent'` AND approved membership.

```sql
create or replace function public.is_parent_member(target_family_code text)
returns boolean language sql security definer set search_path = public stable
as $$
  select public.is_family_member(target_family_code)
     and exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'parent');
$$;
```
Attack-test both ways before believing it: a joined sibling player must be
refused, and a joined parent must still succeed. Note `/privacy` currently
says "Only an account marked as a parent can write those notes" — that is
true of notes (033) and **not** of the budget, so the policy text needs a
look in the same commit.
