# Seeded — notes for Claude

## Current state (2026-11-21)
- Production (seededtennis.com) is healthy; `main` auto-deploys to it with no staging gate.
- Production database: every migration through **051** (ledger 53 on 2026-11-21; 051 applied 03:18 UTC on Niran's go). Check `list_migrations` on `tfpjssmhiptbwigarxpx`, not this line.
- Staging `gnlcpnsweqbtwpaqhqqg` has the same schema plus rehearsal re-runs in its ledger, and the imported catalog rows (production has none). `.env.local` and Vercel Preview point at it.
- Merged 2026-11-20 night: 050 (parent-only budget), code quality, docs, catalog phase 1 (PR E #9, behind `NEXT_PUBLIC_CATALOG_PHASE1_ENABLED`, OFF, no production data), visual polish, sweep fixes, and the Legacy design deleted (one design system; Appearance = Light / Dark / Match system).
- Done 2026-11-21: **migration 051** (PR #17) — a pending-consent under-13 can no longer change tennis/recruiting fields on its own profile (BEFORE UPDATE trigger; the sign-up INSERT is not covered, see TODO).
- Open: the parent-approver gap and post-checkout sync (both DECIDED by Niran 2026-11-21, build after the review — DECISIONS.md, TODO.md); the `Player.currentUTR` number|null refactor; the privacy policy's adult/lawyer review.
- Branch flow: short-lived branch from `main` → PR → CI `verify` → Vercel Preview → merge. `v1` is retired.
- New here? `docs/REVIEWER_GUIDE.md`, then `docs/README.md`.

## Branches
**Branch from `main`, open a PR into `main`.** `main` = production and is
protected: a PR and a green `verify` are required. Merge only after CI passes
and Niran says go in the current turn — `main` auto-deploys to
seededtennis.com with no staging gate, which is why that gate is a person.
Migrations go to production *before* the code that needs them (GO-SEQUENCE).

History: `v1` was the single line of development from 2026-11-11 until the
launch merge on 2026-11-16 (PR #4, `b16d85b`); since then every change is a
short-lived branch off `main`. `origin/macbook-backup` is an archive of six
pre-redesign commits that never landed — don't merge it.

## Read before coding (in this order)
1. `docs/MASTER_ROADMAP.md` — status, blockers, and the NEXT 10 TASKS. Work from it.
2. `docs/SECURITY_CHECKLIST.md` — before touching auth, RLS, profiles, family, billing, or any API route.
3. `docs/DATA_QUALITY.md` — before touching schools, rosters, UTR, or fit math.
4. `docs/TECHNICAL_ARCHITECTURE.md`, `docs/DATABASE_SPEC.md` — how it's built.
5. `docs/QA_CHECKLIST.md`, `docs/DEPLOYMENT_CHECKLIST.md` — before shipping.
6. `docs/HANDOFF.md` — §J, the per-migration production runbook with rollbacks. The old long-form history and route table are in `docs/archive/HANDOFF_HISTORY.md`.

## Always
- Update `docs/MASTER_ROADMAP.md` in the same commit as the work: status, new findings, NEXT 10.
- Before modifying auth/authorization, read the live policies (`pg_policies`) and the 022 trigger. Never replace RLS with a client-side check — `AuthGate`/`PaidGate` are cosmetic.
- Run `rm -rf .next && npx tsc --noEmit && npx next lint && npx vitest run` before saying something works.
- Use one fit-band path: `classifySchoolFit` must always get a projection that can return "out-of-range".
- Show "Not tracked" for missing data. Show the source and date next to any roster number.
- Keep secrets out of code, docs, logs, screenshots, and commits. Names only.

## Never
- Never invent coach names, emails, recruits, rankings, or UTRs — not even as "placeholder" data in shipped code.
- Never write privileged `profiles` columns from the client (`subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*`, `email_verified_at`, `email_verified_for`). The trigger list is enforced by `lib/db/email-verification-gate.test.ts`.
- Never add a feature that promises email/notifications/public pages unless the sending/serving code exists.
- Never build POST-V1 features while any P0/P1 is open.
- Never apply a migration to the shared project before staging exists — and never without explicit sign-off.

## Non-negotiable rules

- **No generated or made-up data, anywhere.** Missing real data → an
  honest empty/"Not tracked" state, never a plausible-looking invention.
- **No fabricated coach emails or outreach content.** Drafts build from
  the player's own real logged results. (The catalog's invented coach
  names/emails were deleted in P0-3; `lib/db/schools-catalog-honesty.test.ts`
  fails the build if they return.)
- **4-band fit model**: Likely / Target / Reach / Out of range, per
  `/methodology`, in `lib/school-fit.ts`. Reach-vs-Out-of-range uses a
  real UTR-trajectory projection, never a static snapshot.
- **"Leaving" counts, never "open spots."** Real grad-year math only.
- **5-item nav**: Today, Plan, Schools, Outreach, Events — the PRIMARY
  nav, unchanged. Below it, a small secondary **"Tools"** group (Results,
  Tournament checker) in the sidebar, the avatar menu on phones and ⌘K
  (docs/DECISIONS.md, 2026-11-18; **approved by Niran 2026-11-19**). Tools is not a sixth primary item; the
  phone bottom bar stays exactly five. Settings/Family live under the avatar
  menu; the theme toggle lives only in Settings → Appearance.
- **Friends and badges are removed, product-wide.** Don't resurrect
  either without being explicitly asked.
- **No auto-generated training plans — manual calendar only.** True in code
  since 2026-11-18: the /training planner, its generator and templates,
  Match mode's prep-plan generator and the whole-state planner save are
  deleted; `lib/training-no-autogen.test.ts` fails the build if any return.
  The calendar reads only sessions in the player's manual plan
  (`training_plans.metadata = {"kind":"manual"}`, lib/db/training.ts).
  **Production still holds 28 generated sessions in 5 plans — hidden, not
  deleted. Niran decided 2026-11-19: keep them hidden, do NOT delete; revisit
  on or after 2026-12-19** (DECISIONS 2026-11-19, TODO).
- **Gmail = compose-link only.** Never the Gmail API, never inbox access,
  never auto-send.
- **UTR = profile link + manual check-in only.** Never fetch or scrape
  UTR data from anywhere.
- **Parents can write exactly two things: the season budget (and its
  expenses) and encouragement notes. Everything else is read-only.**
  Enforced at the RLS layer — **and it was not, until migration 039.**
  `parent_reports` had a policy called `parent_reports_service_insert` that
  was granted to `authenticated` with `with check (is_family_member(...))`,
  so any approved member — a sibling player included — could insert a report
  row with an arbitrary `title` and `public_url` that the family page then
  renders. Named for a rule its body did not implement, exactly like the
  `encouragement_notes_insert_parent` bug 033 fixed. 039 drops the client
  INSERT; the app only ever read that table, so nothing is lost. 039 has been
  on production since 2026-11-16.
  Corrected 2026-11-15 — this said "read-only except the season budget",
  which omitted `encouragement_notes_insert_parent` and made the privacy
  policy wrong for a while.
  That policy's WITH CHECK was `is_family_member(family_code)` — "any
  approved member", despite the name — so a sibling player could write a
  note the UI presents as from a parent. **Fixed in migration 033**: the
  writer's own `profiles.role` must be `'parent'` AND they must be an
  approved member. Attack-tested both ways on staging.
  The budget half was flatter than this bullet until **migration 050
  (2026-11-20)**: `is_parent_member()` granted budget writes to any approved
  joiner regardless of `role`. It now requires the writer's own role =
  'parent' AND approved membership, like 033. Attack-tested on staging and
  production (`~/seeded-evidence/review-ready/r4-rls/`). Check
  `pg_policies`, not this file, before relying on it.
  Corrected again 2026-11-15: until migration 036 a parent who JOINED with
  the code could write **neither** of the two, because the WITH CHECK on both
  reads the row's `family_code` and the app stamped that from the joiner's
  own (NULL) `profiles.family_code`. 036 stamps it in the database instead.
- **Under-13 → a parent creates the account**, checked at onboarding.
- **The mockups are the source of truth for UI.** Match them exactly;
  flag anything that looks wrong instead of silently "improving" it.
- **Never apply a migration, change pricing/Whop config, or push to
  `main` without explicit, current-turn sign-off.** `main` auto-deploys
  straight to production with no staging gate.
- **Local dev points at STAGING, never production.** `.env.local` names the
  staging project (re-check with a grep for the two project refs before you
  trust it). Even on staging, never sign in through real auth with a real
  person's account — use a clearly-fake, disposable `@example.com` account
  and delete or scramble it after testing. (Until 2026-11-15 local dev shared
  production's project; that is why this rule exists.)

## Commands

```
npm run dev          # local dev server, localhost:3000 (reads .env.local = staging)
npm test             # full Vitest suite (npx vitest run)
npm run test:tz      # the suite in America/New_York and Pacific/Auckland
npm run typecheck    # tsc --noEmit
npm run lint         # next lint --max-warnings=0 (fails on any warning)
npm run build        # production build (rm -rf .next first if you hit a
                     # stale-cache module error — known, not a real bug)
```

Migrations and Supabase type generation are done via the Supabase MCP's
`apply_migration` / `generate_typescript_types` tools. **There are two
projects now:**
- `gnlcpnsweqbtwpaqhqqg` — **staging.** Safe to apply to. Holds clearly-fake
  test users and families. After the 2026-11-15 rehearsal that is
  `fake-*@example.com` and families `FAKEFAM-A1/B2/C3/D4/E5/F6`, seeded to
  production's shape (8 profiles, 3 double-linked `parent_accounts` rows, one
  family with 4 profiles on one code). The older `*@test.example` /
  `TESTFAMILYA` set is gone — Supabase Auth rejects the `.example` TLD, which
  is why the newer seed uses `example.com`. **No account on staging has a
  usable password**: the rehearsal's four disposable ones were scrambled to a
  non-bcrypt string afterwards, so `signInWithPassword` fails for all of them.
- `tfpjssmhiptbwigarxpx` — **production.** Read-only unless Niran has given
  current-turn sign-off for a specific migration.

Always apply to staging first and verify with the nine-category schema
fingerprint before proposing anything for production.

**The repo does not reproduce production from `0001` alone** — see
`025_reconcile_profiles_schema_drift.sql` and DATABASE_SPEC. If you build a
fresh database, apply 025 too, and apply 019 before 018 (production's real
order, which is not the repo's numbering).

## The UTR placeholder — read before touching `Player.currentUTR`

`emptyPlayer.currentUTR` is **0**, and `currentUTR <= 0` means "no rating
logged yet". It was 7 until 2026-11-15, when an independent review found
`buildCoachEmail()` rendering **"My UTR is 7.0 (self-reported)"** for a
player who had never entered one — in an email a minor signs their name to.

Two things to know, both learned the hard way the same night:

1. **0 is an IN-MEMORY sentinel. The database rejects it.**
   `profiles_current_utr_check` (migration 006, live on production) is
   `current_utr is null or current_utr between 1 and 16.5`, and
   `utr_entries_utr_check` is `utr between 1 and 16.5` with no NULL escape.
   Writing the sentinel raises **23514**. `writeCurrentPlayerProfile()`
   converts it: `current_utr: player.currentUTR > 0 ? player.currentUTR : null`.
   **Never write `player.currentUTR` straight to Postgres.**
   `lib/utr-sentinel.test.ts` fails the build if that conversion is removed.
2. **Anything DERIVED from the UTR must check `hasRealUtr()` first.** The
   sentinel is detectable, not harmless: left unchecked it produced "Fit
   checked against UTR 0.00", a required pace of "7.1/year", a "closest
   schools" list that was just the catalog's five lowest, a tooltip reading
   "You 0.0 · Gap to median −12.1", and a training plan called "0.0 UTR
   build week". Use `hasRealUtr(v)` / `formatUtrOrNotTracked(v)` from
   `lib/utils.ts` — never `formatUTR` or `.toFixed()` on a raw currentUTR.

The real fix is `Player.currentUTR: number | null`, so the unknown case is
unrepresentable rather than merely detectable. That is a 79-site change and
is still open — see `docs/TODO.md`.

## Enforced invariants and their history (keep in sync with MASTER_ROADMAP)

Formerly "Current blockers". Every bullet below is either DONE (with the rule it left behind, which still applies) or names what is still open. The rules in **Always / Never / Non-negotiable** above are the short form; these are the reasons.
- P0-3: DONE — invented coach names/emails/recruits/ranks/URLs are deleted from the `School` type and all 68 catalog entries; `lib/db/schools-catalog-honesty.test.ts` fails the build on any re-add. Roster UTR numbers are still unsourced estimates, now labeled via `UTR_RANGE_SOURCE_LABEL`. Real fix = P1-DATA-1.
- P0-4: DONE — every sentence in the coach email traces to a value the player entered, or to the school's name/division/conference. UTR is labeled "(self-reported)". Keep it that way: saying more about a program needs sourced data (P1-DATA-1), not better phrasing.
- P0-5: DONE 2026-11-16 — the maintenance page is gone. PR niranramprasad-beep/seeded-tennis#4 merged the (now retired) `v1` line into `main` (`b16d85b`); `middleware.ts` is absent on `main`, every public route returns 200, the deployed client reads production's Supabase (`tfpjssmhiptbwigarxpx`, 0 staging refs). `main` auto-deploys with no staging gate, so the merge gate is still a person.
- P0-6: DONE (it was "partly done" until local dev moved to staging on 2026-11-15; the history below is why the rule exists). Staging is
  `gnlcpnsweqbtwpaqhqqg`, a verified nine-category schema clone, and Vercel
  **Preview** genuinely reads it (proved by grepping the deployed client
  chunks: staging ref present, production ref absent). Production has its own
  three Supabase vars.
  **`.env.local` now points at STAGING** (`gnlcpnsweqbtwpaqhqqg`) —
  re-verified 2026-11-15: one occurrence of that ref, **zero** of the
  production one, and no `SUPABASE_SERVICE_ROLE_KEY` line at all. The
  production service-role key sits in `.env.local.prod-backup`, which
  `.gitignore`'s `.env*` rule covers (confirmed). **Two env files ARE tracked**
  — `.env.example` and `.env.local.example` — and that is fine and deliberate:
  both are placeholders only (zero values longer than 20 characters in
  either). The sentence used to say "no env file is tracked", which was false
  even though the thing it was protecting is true.
  This bullet asserted the opposite until 2026-11-15, on the strength of a
  2026-11-14 check, and it is the first thing anyone reads here — re-run the
  two greps rather than trusting it. The §0 rule stands either way: never
  sign in through real auth locally without a clearly-fake, disposable
  account.
- **All nineteen migrations are ON PRODUCTION as of 2026-11-16** (42 in its ledger; each verified as a real user in rolled-back transactions; schema matches staging 9/9 once function-body comments are ignored). They were first applied and attack-tested on STAGING: 025, 022, 023, 026, 024, 027, 028, 029, 030, 031, 032, 033, 034, 035, 036, 037, 038, 039, 040. **The production run started 2026-11-16 on Niran's go** — check `list_migrations` on `tfpjssmhiptbwigarxpx` for where it stands, not this line. **040 (added mid-run) makes 024's Free target cap block only growth**: as first written it refused every profile save for a Free account already over 3 schools, and production had two. **036 does not ship without 037, 038 and 039** — an independent review found three defects in 036 within an hour, two of which made a sentence 036 itself shipped in `/privacy` untrue. **035 is not optional and must ship with them** — without it 032/033 break every profile write in the app (an `.upsert()` fires BEFORE INSERT triggers even when the row exists) and 034 breaks `delete_my_account()` for every user. Order, per-step verify and per-step rollback: `docs/HANDOFF.md` §J. Nothing ships until Niran says go.
  The highest-risk step is 030 + 031 — a RESTRICTIVE policy on 21 tables. Its pre-flight check (every existing `profiles` row `consent_status = 'not_required'`, zero `'pending'`) is not optional.
  **038 exists because the first two rehearsals used a tidy seed.** A third one (2026-11-15) started from a staging database whose nine-category fingerprint matched production **9 of 9**, seeded in production's real data shape — including a family with 4 profiles sharing one code and three `parent_accounts` rows whose users also carry that code on their own profile. In that shape `family_members()` returned **9 rows for 6 people** and labelled three removable members "account holder", because it was a `UNION ALL` of the two membership shapes and `is_creator` was hardcoded per branch. Nothing in a creator/joiner-disjoint seed can show that. It also found three more rollback gaps (§J defects 5–7) and one claim in §J that production's shape contradicts — see §J's third-rehearsal section.
  **The whole sequence was rehearsed end to end twice on 2026-11-15**, against a database rolled back to production's 23-migration shape. **Seven defects were found in the ROLLBACK half and fixed**, every one by running the plan rather than reading it:
  - step 8's could never run at all (`create or replace` cannot restore a function whose return type a later migration widened; it needs `drop function` first);
  - step 4's created a policy production does not have; step 3's never mentioned `family_join_attempts`; restoring a dropped SECURITY DEFINER function silently re-granted EXECUTE to PUBLIC;
  - **step 12's dropped `profile_row_exists()`, which step 10's rollback CALLS** — run in the documented order, every profile write then raised `42883`. A rollback that breaks the app worse than the thing it is rolling back;
  - steps 9 and 12 were prose where SQL has to be ("restore 030's version verbatim"), which is not pasteable during an incident. Both are written out now.
  **Two traps that rehearsal exposed, worth knowing before you verify anything:**
  (1) In the Supabase SQL editor you are `postgres`, and **`postgres` bypasses RLS** — `set_config('request.jwt.claims', ...)` sets `auth.uid()` but leaves you a superuser, so a row-count check returns everything and looks like a pass. Use `set local role authenticated` as well. Post-037 an approved parent sees exactly **1** `profiles` row — their own — because 037 dropped the cross-user policy and moved the roster into `family_members()`, which returns the other members with an enumerated column list. As `postgres` the same query returns every row, which is what makes the role switch mandatory rather than tidy.
  (2) **Restoring a dropped SECURITY DEFINER function re-grants EXECUTE to PUBLIC and `anon`.** `create or replace` keeps existing grants; a fresh `create` after a `drop` does not. Always follow with the `revoke`/`grant` pair.
- Family linking: `completeFamilySignup()` goes through `join_family()` only — never write `parent_accounts`, `families`, or a joiner's `profiles.family_code` directly; the database rejects all three. Migrations **023 + 026 and the code ship together**; neither half works alone. Approval flow: anyone joining lands PENDING and reads nothing until an approved member approves.
- **The joined-member read gap: FIXED by migration 036** (2026-11-15, on Niran's decision). **But be exact about who it was broken for.** The pre-036 policy keyed off the ROW OWNER's `profiles.family_code`, and every member production has carries it — so production's family members can read each other today. Re-measured on a prod-shaped seed: a pure joiner read 5 profiles, 10 `utr_entries` and 2 matches *before* 036. The read half is a fix for FUTURE joiners (post-023 joiners get NULL); **037's narrowing is the part that changes what today's members can see.** The WRITE half was broken for real, via the app's own stamping path (42501 on a joined parent's note, and a match stamped NULL that their own family then could not read). Membership has two storage shapes — the creator's `profiles.family_code`, and every joiner's `parent_accounts` row, whose `profiles.family_code` is deliberately NULL because writing it is the takeover hole 022/032 closed. `my_family_code()` (026) has always answered across both; almost nothing else did, which broke two separate things:
  1. **Reads.** `family_members_read` and `utr_entries_select_family` both required the owner's `profiles.family_code` to be non-null, so a joiner's rows could never match. 036 replaces seven family read policies with `shares_approved_family_with(uuid)`, which keys off the row OWNER's membership in either shape.
  2. **Writes.** Nine tables carry their own `family_code` column, stamped by the app from `profiles.family_code`. For a joiner that was NULL, so their matches/tournaments were unreadable by their own family AND **a joined parent could not write at all** — the WITH CHECK on `encouragement_notes` / `season_budgets` / `budget_expenses` is `is_family_member(family_code)` / `is_parent_member(family_code)`, both false for NULL. 036 adds a `stamp_family_code` BEFORE INSERT/UPDATE trigger that takes the value from `my_family_code()`, which also closes a hole that was already open: those tables' INSERT policies check only `user_id = auth.uid()` and never the family_code, so a client could publish its own data into a stranger's family page.

  **Never scope a family query by `profiles.family_code`, and never read another user's `profiles` row.** Use `resolveMyFamilyCode()` / `approvedFamilyMemberIds()` / `loadFamilyRosterRows()` from `lib/db/family-scope.ts`. The second rule is 037's: RLS cannot narrow COLUMNS, so any policy letting one member read another's row exposes the whole row — gpa, birth_year, `whop_membership_id`, both stripe ids — which is the shape 027 existed to close. The roster therefore comes from `family_members()`, whose column list is enumerated in SQL.
  `lib/db/family-scope.test.ts` walks `lib/`, `app/` and `components/`. **Its second invariant was defeated on 2026-11-15 and has been rewritten.** An independent review added one scratch file that read `profiles` across users four different ways — including `.eq("family_code", code)`, the exact pattern 037 exists to prevent — and got all 646 tests green. The rule is now the decidable one: **every `profiles` chain must be a single-row read by `.eq("id", …)`**, with no `.in`/`.or`/`.filter`/`.neq`/`.not`/`.match`/`.contains`/`like`/range and never `.eq("family_code", …)`. It names which rule each offending chain broke. It deliberately does NOT catch `.eq("id", someoneElse)` — that is one row and RLS returns zero for it, so the database is the control there. **It is a lint, not a proof.** Re-mutation-tested with the reviewer's own probe file: it now fails, naming all four reasons. The one allow-listed cross-user read is `lib/whop-sync.ts` (service role, email → id, `id` only, refuses unless exactly one row), with `lib/auth.ts` and the generated `lib/db/database.types.ts`.
  `lib/db/family-roster-shape.test.ts` guards the roster function itself: one row per `user_id`, `is_creator` derived from `family_account_holder()`, and no privileged column in its enumerated list. Also mutation-tested. It is mutation-tested against the real repo in two shapes, and its detector carries as test cases the **eight** ways an independent review defeated the first version — including a `//` inside a string literal making a naive comment-stripper swallow the rest of the line. `lib/auth.ts` and the generated `lib/db/database.types.ts` are the only allow-listed files, each with its reason in the test.
  **A row written while a family request was still PENDING is stamped `family_code = NULL` for ever** (the trigger freezes the column on UPDATE, so re-saving cannot heal it). That is why owner-scoped family reads filter by `.in("user_id", ...)` and never by the stamp. 036 fixed the policy and left the app filtering on the stamp — allowed by RLS, never asked for — and a review caught it.
  **`lib/auth.ts`'s `familyCode: profile.family_code` must stay the raw column.** It is round-tripped back through `writeCurrentPlayerProfile()`, and 022/030/035's trigger rejects any client change to `family_code` with 42501 — substituting a joiner's real code there would make renaming yourself in Settings fail for every member who joined with a code.
  **Never restore the old `playerMember?.currentUtr ?? player.currentUTR` fallback** — it papered over the read gap by rendering the signed-in PARENT's own placeholder UTR of 7 as if it were the player's. `lib/family-utr-honesty.test.ts` fails the build if it returns.
  **Fixed by migration 050 (2026-11-20):** `is_parent_member()` used to grant season-budget writes to any approved joiner regardless of `role`, so a sibling player could write the budget. 050 mirrors 033: the caller's own `profiles.role = 'parent'` AND approved membership (either shape); the Family-plan (042) and consent (030) gates stay separate RESTRICTIVE policies. Guard: `lib/db/budget-parent-only.test.ts`. Not closed by 050: a player can sign up a second account as a parent and approve its join themselves (any approved member may approve) — `docs/TODO.md` "Who may approve a parent joiner". Check `pg_policies`, not this file.
- **PR B migrations 041–045 are ON PRODUCTION as of 2026-11-19** (ledger 47; each probed as real users in rolled-back transactions, results in `~/seeded-evidence/rollout-2026-11-19/`), applied on Niran's go before PR B (#6) merged the same day (GO-SEQUENCE §3b, HANDOFF §J Steps 16–20). Check `list_migrations` on `tfpjssmhiptbwigarxpx`, not this line. PR B = niranramprasad-beep/seeded-tennis#6 (→ main), PR C = #7 (stacked on PR B). **044 nulls the roster's player stats for families without the Family plan.** 043's proof must be FRESH and for the CURRENT address (`request_email_verification()` then `mark_email_verified()`; an `auth.users` trigger records email changes) — an independent review moved verification to an unproven address with the first version.
  - **045: one Family plan unlocks ONE family — the payer's home family (`home_family_code()`, the same rule as `my_family_code()`, which now calls it) — and a family holds at most 4 players and 2 parents.** `join_family` returns `family_full`; `approve_family_join` raises `family_full_<role>`; existing members are never removed. The numbers live in `FAMILY_PLAN_MAX_PLAYERS` / `FAMILY_PLAN_MAX_PARENTS` (lib/types) and `lib/family-plan-scope.test.ts` pins them to the SQL. A new family-wide unlock must go through `family_has_tier`, never a raw `subscription_tier = 'family'` check.
  - **042 locks the Family plan in RLS.** A family is unlocked when ANY member (either membership shape) is on `family` — narrowed by 045 to a member whose HOME family it is. Locked = no member reads another member's rows (restrictive `family_plan_required` on every table whose SELECT uses `shares_approved_family_with`) and nobody reads/writes `season_budgets`/`budget_expenses`/`parent_reports`/`encouragement_notes` (a parent keeps reading notes they wrote). A new cross-member read policy MUST get the same ceiling — `lib/db/family-plan-lock.test.ts` fails the build otherwise. Ask the database with `lib/db/family-plan.ts`; API routes call `refuseUnlessFamilyPlan()`. `family_members()` still returns `current_utr`/`target_school_slugs` to a free family (owner's call: the roster stays open).
  - **043: parents prove their email before join/approve/consent** (`42501 verify_email_required`; players never). The proof is a session whose JWT `amr` is `otp`/`magiclink`/`recovery`/`email/signup`, or a verified Google identity — **never `auth.users.email_confirmed_at`, which production auto-confirms at sign-up.** `email_verified_for` must equal the current auth email, so an email change un-verifies.
  - **041: `birth_month` is write-once like `birth_year`.** `writeCurrentPlayerProfile()` only sends it when non-null; sending null would be a refused change and break every save.
- **PR D migrations 046–047 are ON PRODUCTION as of 2026-11-20** (ledger 49; probes in `~/seeded-evidence/fix-audit-2/`). Check `list_migrations`, not this line.
  - **046 `leave_family()`** is the only way to leave: caller-only, refuses the account holder (`account_holder_cannot_leave`) and non-members (`not_in_a_family`), resets an under-13 leaver's consent to pending. After a successful leave the client must drop `Player.familyCode` (046 may have cleared the column; the raw value is round-tripped on save).
  - **047** adds tournament status `'played'`. `'saved'` is shown as "Planning". Entered and Played both count as spend.
  - **Fit bands plan with min(own pace, `PLANNING_PACE_CAP_PER_YEAR` = 1.5/yr)** (lib/fit.ts) — the Reach/Out-of-range split too. The faster line is shown as an "Estimate", never banded. No default plan goal. Guards: `lib/pace-cap.test.ts`, `lib/fit-pace-shapes.test.ts`, `lib/pace-honesty.test.ts`.
  - **Tournament verdicts need the draw's average UTR**; there is no level-to-UTR table (it had no source).
  - **Coach email**: every part names its stored source (`COACH_EMAIL_SOURCES`); Copy/Gmail stay disabled while any `[` or `]` remains (`coachEmailActionState`). `tournaments_goal` (now the player's own optional count, 049) and `tournaments_played` (unused) stay out of anything a coach reads.
- **Migration 049 is ON PRODUCTION as of 2026-11-20 04:58 UTC** (ledger 50; backup `~/seeded-backups/prod-20261119-2343-pre049.dump`, evidence `~/seeded-evidence/no-invented-goal/`). (Since then 050 also shipped — see "Current state" at the top; 048 is PR E's catalog tables, staging only until PR E is approved.) Check `list_migrations` on `tfpjssmhiptbwigarxpx`, not this line.
  - **049 removes the invented "12 tournaments".** `profiles.tournaments_goal` is nullable with no default (CHECK null or 0–60) and was cleared for every row. It is stored with `tournaments_planned_season` (`fall|winter|spring|summer-YYYY`), so a count set for one season reads "Not set" in the next. The app calls it `tournamentsPlanned` ("Tournaments planned this season"): optional, set in Settings → Profile or the diagnostic's last question; "Not set" + a link for players, "Not tracked" for parents. **Never give it a default.** Guard: `lib/no-invented-goal.test.ts`.
  - `tournaments_played` is no longer read or written. "Played this season" was counted from tournaments with status `'played'` (047) on the Legacy parent dashboard only; that screen was deleted with Legacy (2026-11-20), so no screen shows it now.
- **"Remind them" sends nothing** — Seeded has no email or push. It bumps a timestamp that re-sorts the request. Don't let copy imply otherwise.
- P0-7: DONE — removed "Rosters verified Oct 2026", "every team rating shows its source and date", the Sunday-email promise, the Notifications card + tab, the Public-recruiting-page toggle, "Removes everything within 30 days", "all D1 programs", and both "within 48 hours" promises. `lib/copy-honesty.test.ts` fails the build if any phrasing returns. **When a claim becomes true, delete its entry from that test in the same commit — don't reword around it.**
- P0-8: **mechanisms DONE on staging; the privacy policy is still open and is not Claude's to write.** Deletion deletes (`delete_my_account()`, 029) — it takes no arguments, so it can only delete its caller. A full JSON export exists at `/api/account/export`, guarded by a test that fails the build when a new table is neither exported nor explicitly excluded with a reason. Under-13 accounts are inert until an adult in their family consents, enforced by RLS on 21 tables, not by the UI. **"Inert" has exactly one deliberate exception:** `join_family()` still works, so a solo under-13 can ask a family to adopt them — otherwise there is no path to consent at all. Every other write is refused `42501`. Note also that `consent_required_for_birth_year` is `<= 13`, so it gates 13-year-olds too: over-inclusive, i.e. safe. **`birth_year` is write-once from the client** — that is the half that makes the gate real, not the derivation. **Nothing claims to verify that anyone is an adult, and the copy says so.**
  Still missing: a privacy policy that lists processors and retention, reviewed by an adult or a lawyer. And the people who asked to be deleted under the old soft-delete flow are still owed a real deletion by hand (query in HANDOFF §J step 7).
- S-5/S-6/S-7/S-9: DONE. No user can read any part of another user's profile outside their own approved family (027) — and after 037, **not inside it either**: an approved member reads exactly 1 `profiles` row, their own. Independently re-tested from nine identities. Three things that headline glosses over, all verified rather than assumed:
  (a) `family_members()` deliberately returns 15 profile-derived columns about other members. That enumerated list IS the cross-user surface, by design, and `/privacy` lists it.
  (b) `profile_row_exists(uuid)` is granted to `authenticated` and answers "does a profile exist for this id" for ANY id — an existence oracle. Unguessable in practice and required by 035's upsert guard, but it is not nothing.
  (c) The rate-limit bypass is a session GUC (`current_setting('seeded.bypass_rate_limit')`). No browser can set it — PostgREST exposes no `set_config` RPC and no `public` function sets one — but the enforcement is therefore not self-contained: anything that ever executes attacker-chosen SQL as `authenticated` turns the limiter off wholesale. Verified reachable only from a direct SQL session. Every API write route is rate-limited from Postgres, fails closed, and the limits live inside the SQL function so a caller cannot raise its own ceiling (028). Security headers are set and verified against a production build (`next.config.mjs`).
  **Two things that cannot be fixed in this repo and must not be written up as if they were:** login/signup/password-reset rate limits (the browser calls Supabase Auth directly — no Seeded route is on that path) and leaked-password protection. Both are Supabase project settings.
  **A function used in an RLS policy must keep EXECUTE for `authenticated`.** Postgres checks the privilege against whoever runs the query, so revoking it fails the policy closed. Tested on staging 2026-11-14 — do not re-litigate it from the advisor's wording.
- P1-FIT-1/P1-FIT-2/P1-FIT-4: DONE — `whatIfProjectionFor()` always returns a projection (synthetic straight line for the hypothetical modes), and the untouched what-if panel passes the *real* projection, so every screen agrees by construction. `useWhatIfUtr` stores only the player's explicit choice; everything else derives from props, so it can't capture the placeholder `currentUTR: 7` again. Guarded by `lib/fit-band-consistency.test.ts`.
  **Never pass `undefined` as the projection to `classifySchoolFit`** — it isn't neutral, it returns "reach" for every school below the team floor. `syntheticUtrHistoryFor()` exists for cases with no real history, and `realisticPaceProjectionFor()` is the pre-auth case (a visitor who has typed one number and nothing else).
- **BILLING: the Whop webhook has never delivered.** Two real payments
  (2026-10-03, 2026-11-02) left the buyer on `free`. The endpoint is on a
  legacy payload version while its events are v1 names, so nothing ever
  matched. Fixed in code (on the then-current `v1` line, now in `main`); the dashboard steps are Niran's — **HANDOFF
  §K**. Three things to know before touching billing:
  - **Prices live only in `TIER_PRICE_USD` (lib/types).** Player $12/mo,
    $99/yr; Family $19/mo, $159/yr. Never retype a price in a component.
    Note the trap: the new Family monthly is $19, the same number as the OLD
    Player monthly — a grep for "19" finds both.
  - **Never delete `WHOP_PLAN_PLAYER` / `WHOP_PLAN_FAMILY`.** They are the
    legacy $19/$39 plans people are still subscribed on, kept resolve-only:
    `tierForPlanId()` maps them, `planIdFor()` never sells them.
  - **The Whop API key works again (re-tested 2026-11-15).** Niran rolled it;
    the current Owner-role key returns 200 on `memberships.list` and on
    `webhooks.retrieve` for `hook_ActwvOQFQX4Pm`. The old key's blanket 401
    is what made `/api/whop/membership` return `null` and `/api/whop/sync`
    report `whop-unreachable` — that diagnosis is spent, so don't repeat it.
    One real quirk remains: `plans.list` needs `account_id`, not
    `company_id`.
- P1-SEC-1/P1-SEC-5: DONE — the Gemini copilot and Stripe routes are deleted. V1 ships no AI feature. **The Gemini and Stripe keys still need revoking at the provider.**
