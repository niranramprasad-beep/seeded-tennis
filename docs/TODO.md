# Seeded — TODO

Short, ordered, and about *what happens next*. `docs/MASTER_ROADMAP.md`
stays the full picture with acceptance criteria; this file is the queue.

Last updated 2026-11-19.

---

## WEEK 1 — ranked (written by the 2026-11-15 overnight pass)

**Open after PR B (2026-11-18) — Niran's calls or dashboard steps:**

- ~~**One Family subscription unlocks any number of families.**~~ **Decided
  2026-11-19: RESTRICT** — one plan unlocks the payer's home family only, and a
  family holds at most 4 players and 2 parents. Migration 045 (HANDOFF §J
  Step 20); copy on /pricing, the paywall and /privacy.
- **045 follow-ups (review 2026-11-19, LOW, not fixed):** (1) the
  confirmation-required sign-in path (`lib/auth.ts`, `ensureSupabaseProfile`
  on first login) ignores `joinStatus`, so a `family_full` or
  `verify_email_required` there says nothing — production auto-confirms, so it
  is rarely reached; (2) a joiner who was already PENDING when the family
  filled up gets no message — only the approver sees `family_full`; (3) support
  has no way to raise one family's cap short of a migration, and an under-13
  refused by a full family can only reach consent through support.
- **Live magic-link check for 043** (HANDOFF §J Step 18): needs a real inbox on
  staging, and `<site>/auth/verified` added to Supabase Auth → URL
  Configuration → Redirect URLs on staging and production BEFORE 043 ships.
- **Email budget:** every parent who wants to approve or consent will need one
  verification email; production's custom SMTP allows 80/hour for the whole
  project, shared with password resets. Supabase Auth's own rate limits are the
  only real cap on `signInWithOtp` (the `email_verify` bucket limits Seeded's
  own path only).
- **Production's 28 generated workout sessions** (5 training_plans, 3 users)
  are hidden by PR C, not deleted. **Decided 2026-11-19: keep them hidden; do
  not delete. Revisit on or after 2026-12-19** (30 days): if nobody has asked
  for them, propose deletion again with a backup.

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

**Do these two first — both are migrations, so neither ships in the UI
polish PR (Niran, 2026-11-16):**

- **A. An under-13 whose consent is PENDING must see no family names,
  emails or ratings.** Today `family_members()` still returns the roster
  (names, emails, ratings) to a pending under-13 who has joined a family —
  030/031 make their account inert for writes and most reads, but this
  SECURITY DEFINER function is the exception. Fix: have `family_members()`
  return zero rows (or only the caller's own row) while
  `my_consent_state()` is `pending`; rehearse on staging with a pending
  under-13 joiner; guard test on the roster function. See item 10 below,
  which this replaces.
- **B. Parents cannot insert player-data rows under their own account.**
  Role-gate the INSERT policies on utr_entries, matches, tournament_entries,
  coach_outreach, daily_checkins and the other player tables
  (`profiles.role = 'player'` in WITH CHECK, mirroring 033).
  (`is_parent_member()` became role-aware in 050, 2026-11-20.) Today the app's routes refuse it (403),
  but PostgREST allows it. Same item as 3 below, promoted.

1. **Parent dashboard upgrade** (Niran's #1). The player's UTR trend as the
   hero — real results plus a dashed "Estimate" junior-year projection with
   the slow/fast band; a KPI row (UTR change, Target+Likely by junior year,
   coaches emailed/replied, season spend vs budget); per-category budget bars
   that turn amber at 90% and RED with one calm sentence when over budget
   (icon + text, never colour alone); a budget-vs-actual mini chart; the
   last 5 expenses; parent next-actions; teaching empty states. Monarch's
   trend-as-hero, Copilot's calm polish, YNAB's budget-vs-actual — in
   Seeded's own design system, light and dark. **Build it on tonight's
   plumbing:** `pickFamilyPlayer()` for the subject, `DataSubject` loaders
   for every number, `parentScopeSentence()` for the story. **A player
   switcher** belongs here too: a family with two players sees one of them
   (deterministically the first to join), and Settings says "Reports show
   one player for now".
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
7. **Delete Legacy (P1-UX-2).** Tonight found Legacy-only raw hex colours
   (`components/tournaments/tournament-fit-view.tsx`,
   `components/home/fit-finder-teaser.tsx`), a Legacy match-mode "8pm
   reminder" (browser notifications while open), and Legacy school-page
   copy; every honesty guard covers Legacy twice.
8. **Verify checkout on the HTTPS preview.** Locally Whop rejects an
   `http://localhost` return URL, so the four checkout starts could only be
   checked to the request. `/api/whop/checkout` now pins the return URL to
   the production domain or the preview's own `https://$VERCEL_URL`.
9. **Players' theme follows the account, not the device.** Signed in, the
   stored theme overrides the browser's on every load (DesignPreferenceSync
   pulls it). Tonight stopped the per-page-view WRITE; whether a phone and a
   laptop should share a theme is a product call.
10. **What an under-13 awaiting consent can read** (independent verifier,
    2026-11-16). RLS keeps a pending account out of 21 tables, but
    `family_members()` is SECURITY DEFINER and returns the family's members
    — names, emails, ratings, targets — to any approved member, consent
    pending or not. It is inside their own family, so not a leak, but it is
    more than "inert". Decide whether `family_members()` should return
    nothing (or names only) while the caller's `consent_status = 'pending'`;
    that is a migration. The copy no longer claims "reads nothing".
11. **The projection's ceiling is silent.** `cappedByCeiling` (lib/fit.ts)
    is computed and never shown: a Class of 2034 player at 8.7 projects to
    14.0, the realistic ceiling, with typical and fast growth equal. Say so
    on the screen when it happens. Small.
12. **In the last hours before June 1 of the target summer** the projection
    rounds to today's rating but is still chipped "Estimate". Cosmetic; flip
    `isProjected` when the remaining time is under a day.
14. ~~**A parent's /schools shifts on a phone.**~~ **DONE 2026-11-16
    (PR A, `fix/ui-polish-1`)** exactly as proposed: `seeded.role` in
    localStorage (set by one effect in player-context on every sign-in path,
    cleared on sign-out), `html[data-role]` from the head script, and
    role-sized placeholders — plus the band chips and fit column held while
    a parent's roster loads. Measured with a layout-shift probe: persona f
    0.0001 / 0.0004 / 0.0034 and persona a 0.0001 / 0.0004 / 0.0021 at
    320 / 375 / 1440 (were up to 0.29 for f mid-PR, 0.13–0.20 for a before).
15. **LCP on a simulated slow-4G phone is 5.1–6.1 s** on every public
    route (Lighthouse mobile, local production build; performance 78–81,
    CLS 0, TBT ≈ 0). Six web-font families load on every page; start there
    (drop unused families, subset, `preload: false` on the decorative
    ones), then check field data in Vercel Speed Insights after launch —
    lab LCP on localhost is an estimate, not what users see.
13. `isConsentPendingAllowedPath` lists `/family`, but players are blocked
    from `/family` first, so the entry does nothing. Remove it or document
    why it is there.

## Blocking the production rollout

### 1. ✅ Family linking — DONE (2026-11-14), staging only
`completeFamilySignup()` uses `join_family()` only; 023 + 026 applied and
end-to-end tested on staging (30/30). Ships as one unit with those two.

### 2. ✅ Vercel Preview + local Development on staging — DONE (Niran, 2026-11-14)
All three Supabase vars are Production-only; Preview and Development carry
their own, pointing at `gnlcpnsweqbtwpaqhqqg`. Verified read-only from the
project's env config. **One caveat:** the newest `v1` preview deployment
was built ~2 hours BEFORE that change, so it is still talking to
production. The next push to `v1` produces the first preview that actually
reads staging — worth confirming on that build rather than this one.

Niran also found and fixed something worse while doing it: preview deploys
were using the **production** service-role key.

### 3. ✅ Branch protection on `main` — DONE (Niran, 2026-11-14)
Ruleset "Protect main": PR required, `verify` required, force pushes
blocked. **Work with it, never around it.**

### 4. ✅ Credentials — DONE (Niran, 2026-11-14)
`GEMINI_API_KEY` deleted from Vercel; Stripe was never used; the Whop key
was verified never committed, so no rotation was needed.

### 5. The rollout itself
Nine migrations, in order, then the code:
`025 → 022 → 023 → 026 → 024 → 027 → 028 → 029 → 030 → 031`, then revert
the maintenance commit and merge `v1` → `main`. Every step has a verify
and a rollback in `docs/HANDOFF.md` §J. **Waiting on Niran's "go".**

Highest-blast-radius step is 8 (030 + 031): it adds a restrictive policy to
21 tables. Its pre-flight check — every existing row `consent_status =
'not_required'`, zero `'pending'` — is the one that must not be skipped.

---

## Still open after the rollout

- **An EMPTY family's code can be claimed by a new signup** (found on
  production 2026-11-16, step 9). 032 blocks a code that any profile or
  `parent_accounts` row holds; production has one `families` row with 0
  holders and 0 links, and a profile INSERT with that code succeeds. It
  exposes nothing — there is no one in it to read — so it is LOW. Fix:
  delete member-less `families` rows (service role, by hand), or have
  `family_code_is_taken()` also check `families`.

6. **P0-8's other half — the privacy policy.** The mechanisms are built and
   tested: real deletion, a complete JSON export, under-13 consent, and
   nothing about a minor visible to any other user. What does not exist is
   the document that explains all of that to a parent, lists the processors
   (Supabase, Vercel, Whop, Google Analytics) and states retention. That
   needs an adult or a lawyer, not Claude. The one-paragraph policy inside
   `/terms` is what is live today.
7. ✅ **People who asked to be deleted under the old flow — none.** Checked
   read-only on production 2026-11-14: `select count(*) from profiles where
   deletion_requested_at is not null` returns **0**. Nobody is owed a manual
   deletion. §J step 7's check stays in the plan because it is cheap and the
   answer could change before the rollout.
8. **CAPTCHA on signup and password reset.** Decided 2026-11-14: leaked-
   password protection is a Pro-plan feature and is deferred until there are
   paying users; Supabase Auth's own per-IP limits are accepted for launch.
   The gap that leaves is scripted account creation and reset-email
   flooding, which per-IP limits alone do not stop. Supabase supports hCaptcha
   and Turnstile natively (Authentication → Settings → Bot and Abuse
   Protection) and the client needs a token passed to `signUp`/
   `resetPasswordForEmail`, so this is a real change to `lib/auth.ts` and
   the signup form, not a dashboard toggle. Revisit with leaked-password
   protection at the first paying users.
9. **P1-FIT-3** — projections are still nonsense on noisy data ("Projected
   4.3" for a 5.81 player). Needs outlier rejection and a floor.
10. **P1-DATA-1** — real roster import (migration 012, reserved). Still the
    highest-value product task: a 5.81 player has zero schools in range and
    every roster number reads "Unverified estimate". P1-FIT-4 made this
    sharper, not softer — a 3.0 visitor now correctly sees 0 programs in
    range, which is the honest answer and a bad product.
11. **P1-UX-2** — delete Legacy. Last place with its own copy and its own
    coach view; every honesty guard has to cover it twice.
12. **Nonce-based CSP** — drops `'unsafe-inline'` from `script-src`. Needs
    middleware, and `main`'s middleware is currently the maintenance page,
    so this waits until that is reverted (P2).

---

## Billing — before launch

See `docs/HANDOFF.md` §K for the full diagnosis. In short: **two real
payments produced nothing**, because the webhook has never been delivered to.
The code side is done and on `v1`; the rest is Niran's, in the dashboard.

- [ ] Set `hook_ActwvOQFQX4Pm` to API version **v1** (it is on legacy). This
      is the actual fix.
- [ ] Copy the endpoint's `ws_` signing secret into `WHOP_WEBHOOK_SECRET`
      (a recreated endpoint issues a new one).
- [ ] **Check the Whop API key's scopes.** The local key 401s on
      `memberships.list` and `webhooks.list` — it can only read public plan
      data. If production uses the same key, `/api/whop/membership` and the
      new post-checkout sync are both dead on arrival.
- [ ] Add the four new plan IDs to Vercel Production; keep the two legacy
      ones (table in §K).
- [x] ~~Let `/api/whop/webhook` through the maintenance middleware on
      `main`~~ — **moot, and worth knowing why.** The matcher change was
      only ever needed because the merge plan kept the maintenance
      middleware alive on `main`. It doesn't: `middleware.ts` is deleted on
      `v1` (commit below this one), so after the merge there is no
      middleware on any path and the webhook answers normally. The replay
      therefore waits on the deploy, not on a matcher.
- [ ] Replay the missed `membership.activated` events, or reconcile the two
      existing customers by hand.
- [ ] Run the $0 promo-code end-to-end test (§K) on staging.
- [x] **Soft 404 on unknown school slugs — FIXED 2026-11-15 overnight** (`dynamicParams = false`; verify on the next preview that `/schools/not-a-real-school` returns 404). `/schools/<anything>` returns
      HTTP **200** with a page titled "School not found — Seeded" (measured on
      the f0f2919 preview). Google indexes a 200, so junk slugs can become
      indexable pages. Low risk today — nothing links to them and the sitemap
      lists only real pages — but the honest status is 404. P2; `robots.txt`
      does not disallow `/schools/`, so if this is left, consider whether it
      should.
- [ ] **Supabase SMTP (Resend).** Niran is wiring this 2026-11-15. A real
      signup against the preview returned `429 over_email_send_rate_limit`:
      the built-in sender allows a few messages an hour, so with "Confirm
      email" on, launch day's third signup cannot confirm. Re-test one real
      signup end to end once Resend is live.
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

---

## What a lawyer has to check before launch (P0-8)

`/privacy` and `/terms` are a careful, verified description of what the
software does, written by Claude. **They are not legal advice and no lawyer
has read them.** `lib/legal/policy.ts` carries a source for every claim and
`lib/legal/policy.test.ts` fails the build when one stops being true — but
"accurate about the code" and "legally sufficient" are different standards.

Specifically needs a human with legal training:

1. **COPPA.** Users are 13–18 and under-13s are allowed with a parent's
   approval. Our mechanism is: the account is inert until an adult in the
   family states they are the parent. **Seeded verifies nothing** — the
   policy says so plainly. Whether "verifiable parental consent" under COPPA
   is satisfied by that is the central legal question, and the answer may be
   no. If it is no, the options are real verification (card, ID, signed
   form) or refusing under-13 accounts outright.
2. **Who the controller is**, and whether a US-only product needs GDPR/UK
   wording. We make no claim either way right now.
3. **State minor-privacy laws** (California's Age-Appropriate Design Code
   and equivalents) — data minimisation, default privacy settings, and
   whether a 15-year-old can consent for themselves.
4. **The terms themselves**: liability, disclaimers, arbitration, governing
   law. The current /terms is five short paragraphs and reads as a product
   summary, not a contract.
5. **Retention.** We keep data until the account is deleted, with no expiry.
   That is simple and honest; whether it is lawful for minors' data is not
   for us to say.
6. **The contact address** `support@seededtennis.com` must actually exist and
   be monitored before launch — the policy tells parents to use it for data
   requests about their child.
7. **Processor agreements** with Supabase, Vercel and Whop (DPAs).

## Dependency debt

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

## Smaller things worth not forgetting

- Regenerate `lib/db/database.types.ts` against production after the
  rollout. It is currently hand-maintained against staging: `profiles`
  gained `birth_year` + three consent columns, `parent_accounts` four,
  `family_members()` returns a ninth column, and `rate_limit_events` is new.
- `/parent-signup` asks a parent for their Gender and Grade in school. They
  are the player profile's fields on a form that is not the player's. Not
  new, now more visible since the step gained a birth year.
- `coach_outreach` still carries 024's superseded `..._insert` / `..._update`
  policies requiring `has_tier('family')` alongside the `..._own` policy
  requiring `player`. Permissive policies OR, so Player tier works — but the
  dead pair reads as a contradiction to the next person.
- Self-host the `next/font` Google fonts. The build intermittently fails
  fetching them; CI retries 3× as a workaround (P2).
- Pricing comparison table at 390px: 640px table in a 350px scroller, only
  the Free column visible, no scroll affordance (P2).
- Test fixtures use real school names ("Duke") against the clearly-fake
  rule in CLAUDE.md. Low risk, pure-logic tests, but worth tidying.
- Staging holds clearly-fake test users (`*@test.example`) and family
  `TESTFAMILYA`, left in place deliberately as seed data. `TESTFAMILYB` and
  three of those users were consumed by the deletion tests and are gone —
  that was the test.

## ✅ A parent cannot read a JOINED player's data — FIXED 2026-11-15 (migration 036)

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

## Still open: `anon` holds column grants on `profiles`

Harmless today and worth closing anyway. `anon` has table-level SELECT on
`profiles` (and the other user tables). It reads nothing, because every
policy is `to authenticated` and RLS denies by default — but that is one
mechanism deep, and 037's whole lesson is that column grants are the layer
RLS cannot reach.

`revoke select on public.profiles from anon;` is probably safe (nothing
pre-auth reads a profile — the pre-auth fit report is pure client-side
computation over the school catalog), but it is an unrequested change to the
auth surface and it belongs in its own commit with its own check that signup
and the signed-out pages still work.

## Still open: two silent-empty paths introduced 2026-11-15

Recorded rather than fixed, because both fail CLOSED and an empty family page
is the right failure for a transient RPC error — but the next person should
know they are new.

- `approvedFamilyMemberIds()` / `loadFamilyRosterRows()` return `[]` on any
  `family_members()` RPC error, and `loadFamilyMembers()` then renders the
  "no player has joined yet" state. Before 036/037 the roster came from a
  direct `select`, so a failure surfaced differently.
- `getProfileRoleAndFamily()` ignores a `my_family_code` RPC error, and the
  budget routes turn the resulting `null` into a 403 "You're not part of a
  family yet." That message is wrong for a transient failure.

Both want the same fix: distinguish "no family" from "could not ask", and
show an error state for the second. Small, and worth doing before the first
support email about it.

## Who may approve a parent joiner (found by the 050 review, 2026-11-20)

**MEDIUM, open.** 050 makes the budget parent-only, but "parent" is a role
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

## TRUNCATE is granted to anon/authenticated on the budget tables (pre-existing, LOW)

Found by the same review: `anon` and `authenticated` hold TRUNCATE on
`season_budgets` and `budget_expenses` (Supabase's default grants), and
TRUNCATE ignores RLS. PostgREST cannot issue it, so it is reachable only
from a direct SQL session — the same caveat as S-5 (c). Revoking TRUNCATE
(and REFERENCES/TRIGGER) from anon/authenticated on every public table is a
cheap, low-risk migration; do it with the next one.

## DONE (050, 2026-11-20): `is_parent_member()` is flatter than its name

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

## /sample-report reports no First Contentful Paint, so Lighthouse scores it 0

**Not a user-facing bug — the page renders correctly and fast. It is a
measurement anomaly, and it will make PageSpeed Insights show 0 for a
marketing page.**

Found in the Night 2 quality pass. Lighthouse mobile returns
`NO_FCP: "The page did not paint any content"` for `/sample-report` and
scores every category 0. Reproduced outside Lighthouse with Playwright:

| condition | FCP |
|---|---|
| 4× CPU throttle, normal motion | **none** |
| 4× CPU throttle, reduced motion | **none** |
| no throttle | **none** |

`first-paint` fires at ~100 ms, `innerText` is 1467 characters, and a
screenshot under 4× CPU throttle shows the page rendered correctly
(`docs/screenshots/` was not updated for this; the capture is in the session
scratchpad). Every other page records FCP in ~350 ms. So Chrome paints the
content but never classifies a paint as *contentful* on this page only.

Ruled out: the `animate-fade-in` wrapper (no delay, `both` fill, and
reduced-motion collapses it to 0.01 ms — FCP is still absent with motion
reduced), and JavaScript errors (none on the page).

Not ruled out: this page is fully server-rendered with no
`BAILOUT_TO_CLIENT_SIDE_RENDERING`, unlike the others, so its content paints
in the first frame. It also renders the only recharts SVG among the public
pages.

**Suggested next step:** measure it on a real deployment rather than a local
`next start` — run PageSpeed Insights against the production URL once
`/sample-report` is live. If it reports 0 there too, bisect by temporarily
removing `UtrVsPlanChart` from the page and re-measuring. Do not "fix" it by
adding an artificial paint; find the cause first.

## /onboarding's server HTML is a spinner (found Night 2 by the review)

Low, but it is the top of the funnel and sitemap priority 0.9.
`OnboardingPageSwitch` only renders `SeededPreAuthOnboarding` once
`hydrated && !isAuthed`; before hydration it renders `<AuthGate>`, whose
unhydrated branch is a spinning element. So a crawler that does not execute
JavaScript sees a spinner, not the free fit report.

The `GATED_BUT_PUBLIC` exemption in `lib/seo/private-routes.ts` says
"a signed-out Seeded visitor gets SeededPreAuthOnboarding" — true for a
JS-executing client only. Lighthouse SEO scores 100 because it does not
check rendered content.

Not fixed because the fix is a real architecture decision, not a tweak: the
design choice is read from `localStorage`, which is why this cannot be a
server redirect (see the comment in `components/shared/seeded-route-redirect.tsx`).
Options are to server-render the pre-auth flow as the default and swap after
hydration, or to accept it and drop the page's sitemap priority.

## From PR D (2026-11-19)
- ~~`tournaments_goal` defaults to 12 and nobody is ever asked~~ — DONE on
  `fix/no-invented-goal` (migration 049, 2026-11-20): nullable, no default,
  every stored 12 cleared; asked (optional) in the diagnostic and Settings →
  Profile; played is counted from `tournament_entries`. Still open from it:
  drop the unused `profiles.tournaments_played` column (049 left it); decide
  whether `family_members()` should return the planned count (a parent sees
  "Not tracked" today because 037's enumerated list excludes it).
- Public LCP is still 2.7–3.3 s on most routes (target 2.5): ~285 KB of JS
  before first paint. Next steps in `docs/archive/audit-2-perf.md` (async
  `getSupabase()`, framer-motion `LazyMotion`). Re-measure production after
  merge with `scripts/perf-lighthouse.mjs`.
- Family dashboard pace wording ("At the pace in X's logged ratings") has no
  upside sentence; `utrDeltaOverMonths` / `computeMyPaceUTR` are test-only now.
- An opponent's UTR in a coach-email result sentence is not labelled
  "(self-reported)".
- The Events calendar heading still says "Training" though it shows
  tournaments too (mockup) — needs a design call.
- A pre-033 account with no `birth_year` can pick one in the signed-in
  diagnostic but it isn't saved (write-once column).
- `scripts/sweep-c.mjs` depends on a staging persona password that no longer
  exists by design; document how to set and scramble one per run.

