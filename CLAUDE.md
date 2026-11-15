# Seeded — notes for Claude

## Branches
**Work on `v1`.** `main` = production; only merge to `main` after CI passes
and Niran says go.

`v1` is the single line of development (renamed from `docs/production-audit`
on 2026-11-11). It contained every commit on `main` until the maintenance
commit landed on `main` alone on 2026-11-14; `main` was merged back into `v1`
on 2026-11-15 (`0cea97e`) and `middleware.ts` deleted in the commit after it,
which is the only way the merge down actually removes the 503 — see HANDOFF
§J step 15. `main` auto-deploys to seededtennis.com with no staging gate,
which is why that gate is a person.

`origin/macbook-backup` is an archive of six pre-redesign commits that never
landed. Don't merge it; cherry-pick an idea from it if P1-UX-2 needs one.

## Read before coding (in this order)
1. `docs/MASTER_ROADMAP.md` — status, blockers, and the NEXT 10 TASKS. Work from it.
2. `docs/SECURITY_CHECKLIST.md` — before touching auth, RLS, profiles, family, billing, or any API route.
3. `docs/DATA_QUALITY.md` — before touching schools, rosters, UTR, or fit math.
4. `docs/TECHNICAL_ARCHITECTURE.md`, `docs/DATABASE_SPEC.md` — how it's built.
5. `docs/QA_CHECKLIST.md`, `docs/DEPLOYMENT_CHECKLIST.md` — before shipping.
6. `docs/HANDOFF.md` — long-form history and route table (see its correction banner).

## Current blockers (keep in sync with MASTER_ROADMAP)
- P0-3: DONE — invented coach names/emails/recruits/ranks/URLs are deleted from the `School` type and all 68 catalog entries; `lib/db/schools-catalog-honesty.test.ts` fails the build on any re-add. Roster UTR numbers are still unsourced estimates, now labeled via `UTR_RANGE_SOURCE_LABEL`. Real fix = P1-DATA-1.
- P0-4: DONE — every sentence in the coach email traces to a value the player entered, or to the school's name/division/conference. UTR is labeled "(self-reported)". Keep it that way: saying more about a program needs sourced data (P1-DATA-1), not better phrasing.
- P0-5: production is in **maintenance mode** since 2026-11-14 (`main` @ `d059006`, one commit adding `middleware.ts`, verified live 503). The broken `contacted` write no longer reaches users. Real close-out is the `v1` merge. **That commit is not revertable from `v1`** — it is not an ancestor of `v1`, and the plain merge *keeps* `middleware.ts`, so the deploy would have gone READY with the site still 503. Handled on `v1` instead: merge `main` in, then delete the file in its own commit. HANDOFF §J step 15.
- P0-6: **PARTLY done, and the dangerous half is still open.** Staging is
  `gnlcpnsweqbtwpaqhqqg`, a verified nine-category schema clone, and Vercel
  **Preview** genuinely reads it (proved by grepping the deployed client
  chunks: staging ref present, production ref absent). Production has its own
  three Supabase vars.
  **`.env.local` now points at STAGING** (`gnlcpnsweqbtwpaqhqqg`) —
  re-verified 2026-11-15: one occurrence of that ref, **zero** of the
  production one, and no `SUPABASE_SERVICE_ROLE_KEY` line at all. The
  production service-role key sits in `.env.local.prod-backup`, which
  `.gitignore`'s `.env*` rule covers (confirmed; no env file is tracked).
  This bullet asserted the opposite until 2026-11-15, on the strength of a
  2026-11-14 check, and it is the first thing anyone reads here — re-run the
  two greps rather than trusting it. The §0 rule stands either way: never
  sign in through real auth locally without a clearly-fake, disposable
  account.
- **Seventeen migrations are applied and attack-tested on STAGING and none are on production:** 025, 022, 023, 026, 024, 027, 028, 029, 030, 031, 032, 033, 034, 035, 036, 037, 038. **036 does not ship without 037 and 038** — an independent review found three defects in 036 within an hour, two of which made a sentence 036 itself shipped in `/privacy` untrue. **035 is not optional and must ship with them** — without it 032/033 break every profile write in the app (an `.upsert()` fires BEFORE INSERT triggers even when the row exists) and 034 breaks `delete_my_account()` for every user. Order, per-step verify and per-step rollback: `docs/HANDOFF.md` §J. Nothing ships until Niran says go.
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
  `lib/db/family-scope.test.ts` walks `lib/`, `app/` and `components/` and fails the build on either reintroduction. `lib/db/family-roster-shape.test.ts` guards the roster function itself: one row per `user_id`, `is_creator` derived from `family_account_holder()`, and no privileged column in its enumerated list. Both are mutation-tested. It is mutation-tested against the real repo in two shapes, and its detector carries as test cases the **eight** ways an independent review defeated the first version — including a `//` inside a string literal making a naive comment-stripper swallow the rest of the line. `lib/auth.ts` and the generated `lib/db/database.types.ts` are the only allow-listed files, each with its reason in the test.
  **A row written while a family request was still PENDING is stamped `family_code = NULL` for ever** (the trigger freezes the column on UPDATE, so re-saving cannot heal it). That is why owner-scoped family reads filter by `.in("user_id", ...)` and never by the stamp. 036 fixed the policy and left the app filtering on the stamp — allowed by RLS, never asked for — and a review caught it.
  **`lib/auth.ts`'s `familyCode: profile.family_code` must stay the raw column.** It is round-tripped back through `writeCurrentPlayerProfile()`, and 022/030/035's trigger rejects any client change to `family_code` with 42501 — substituting a joiner's real code there would make renaming yourself in Settings fail for every member who joined with a code.
  **Never restore the old `playerMember?.currentUtr ?? player.currentUTR` fallback** — it papered over the read gap by rendering the signed-in PARENT's own placeholder UTR of 7 as if it were the player's. `lib/family-utr-honesty.test.ts` fails the build if it returns.
  Still open and deliberately NOT in 036: `is_parent_member()` grants season-budget writes to any approved joiner regardless of `role`, so a sibling player can write the budget. Fix is to mirror 033's pattern; see `docs/TODO.md`. Check `pg_policies`, not this file.
- **"Remind them" sends nothing** — Seeded has no email or push. It bumps a timestamp that re-sorts the request. Don't let copy imply otherwise.
- P0-7: DONE — removed "Rosters verified Oct 2026", "every team rating shows its source and date", the Sunday-email promise, the Notifications card + tab, the Public-recruiting-page toggle, "Removes everything within 30 days", "all D1 programs", and both "within 48 hours" promises. `lib/copy-honesty.test.ts` fails the build if any phrasing returns. **When a claim becomes true, delete its entry from that test in the same commit — don't reword around it.**
- P0-8: **mechanisms DONE on staging; the privacy policy is still open and is not Claude's to write.** Deletion deletes (`delete_my_account()`, 029) — it takes no arguments, so it can only delete its caller. A full JSON export exists at `/api/account/export`, guarded by a test that fails the build when a new table is neither exported nor explicitly excluded with a reason. Under-13 accounts are inert until an adult in their family consents, enforced by RLS on 21 tables, not by the UI. **`birth_year` is write-once from the client** — that is the half that makes the gate real, not the derivation. **Nothing claims to verify that anyone is an adult, and the copy says so.**
  Still missing: a privacy policy that lists processors and retention, reviewed by an adult or a lawyer. And the people who asked to be deleted under the old soft-delete flow are still owed a real deletion by hand (query in HANDOFF §J step 7).
- S-5/S-6/S-7/S-9: DONE. No user can read any part of another user's profile outside their own approved family (027). Every API write route is rate-limited from Postgres, fails closed, and the limits live inside the SQL function so a caller cannot raise its own ceiling (028). Security headers are set and verified against a production build (`next.config.mjs`).
  **Two things that cannot be fixed in this repo and must not be written up as if they were:** login/signup/password-reset rate limits (the browser calls Supabase Auth directly — no Seeded route is on that path) and leaked-password protection. Both are Supabase project settings.
  **A function used in an RLS policy must keep EXECUTE for `authenticated`.** Postgres checks the privilege against whoever runs the query, so revoking it fails the policy closed. Tested on staging 2026-11-14 — do not re-litigate it from the advisor's wording.
- P1-FIT-1/P1-FIT-2/P1-FIT-4: DONE — `whatIfProjectionFor()` always returns a projection (synthetic straight line for the hypothetical modes), and the untouched what-if panel passes the *real* projection, so every screen agrees by construction. `useWhatIfUtr` stores only the player's explicit choice; everything else derives from props, so it can't capture the placeholder `currentUTR: 7` again. Guarded by `lib/fit-band-consistency.test.ts`.
  **Never pass `undefined` as the projection to `classifySchoolFit`** — it isn't neutral, it returns "reach" for every school below the team floor. `syntheticUtrHistoryFor()` exists for cases with no real history, and `realisticPaceProjectionFor()` is the pre-auth case (a visitor who has typed one number and nothing else).
- **BILLING: the Whop webhook has never delivered.** Two real payments
  (2026-10-03, 2026-11-02) left the buyer on `free`. The endpoint is on a
  legacy payload version while its events are v1 names, so nothing ever
  matched. Fixed in code on `v1`; the dashboard steps are Niran's — **HANDOFF
  §K**. Three things to know before touching billing:
  - **Prices live only in `TIER_PRICE_USD` (lib/types).** Player $12/mo,
    $99/yr; Family $19/mo, $159/yr. Never retype a price in a component.
    Note the trap: the new Family monthly is $19, the same number as the OLD
    Player monthly — a grep for "19" finds both.
  - **Never delete `WHOP_PLAN_PLAYER` / `WHOP_PLAN_FAMILY`.** They are the
    legacy $19/$39 plans people are still subscribed on, kept resolve-only:
    `tierForPlanId()` maps them, `planIdFor()` never sells them.
  - **The local Whop API key cannot read this account's memberships** (401 on
    `memberships.list`). `/api/whop/membership` and `/api/whop/sync` both
    depend on that call. Check the key before believing either works.
- P1-SEC-1/P1-SEC-5: DONE — the Gemini copilot and Stripe routes are deleted. V1 ships no AI feature. **The Gemini and Stripe keys still need revoking at the provider.**

## Always
- Update `docs/MASTER_ROADMAP.md` in the same commit as the work: status, new findings, NEXT 10.
- Before modifying auth/authorization, read the live policies (`pg_policies`) and the 022 trigger. Never replace RLS with a client-side check — `AuthGate`/`PaidGate` are cosmetic.
- Run `rm -rf .next && npx tsc --noEmit && npx next lint && npx vitest run` before saying something works.
- Use one fit-band path: `classifySchoolFit` must always get a projection that can return "out-of-range".
- Show "Not tracked" for missing data. Show the source and date next to any roster number.
- Keep secrets out of code, docs, logs, screenshots, and commits. Names only.

## Never
- Never invent coach names, emails, recruits, rankings, or UTRs — not even as "placeholder" data in shipped code.
- Never write privileged `profiles` columns from the client (`subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*`).
- Never add a feature that promises email/notifications/public pages unless the sending/serving code exists.
- Never build POST-V1 features while any P0/P1 is open.
- Never apply a migration to the shared project before staging exists — and never without explicit sign-off.

## Non-negotiable rules

- **No generated or made-up data, anywhere.** Missing real data → an
  honest empty/"Not tracked" state, never a plausible-looking invention.
- **No fabricated coach emails or outreach content.** Drafts build from
  the player's own real logged results. (Coach name/email fields
  themselves are still unverified seed data — see HANDOFF TODO #1.)
- **4-band fit model**: Likely / Target / Reach / Out of range, per
  `/methodology`, in `lib/school-fit.ts`. Reach-vs-Out-of-range uses a
  real UTR-trajectory projection, never a static snapshot.
- **"Leaving" counts, never "open spots."** Real grad-year math only.
- **5-item nav**: Today, Plan, Schools, Outreach, Events. Settings/Family
  live under the avatar menu.
- **Friends and badges are removed, product-wide.** Don't resurrect
  either without being explicitly asked.
- **No auto-generated training plans — manual calendar only.** (Currently
  violated by the training setup wizard — see HANDOFF TODO #2, not fixed
  yet, don't treat the existing wizard as the intended design.)
- **Gmail = compose-link only.** Never the Gmail API, never inbox access,
  never auto-send.
- **UTR = profile link + manual check-in only.** Never fetch or scrape
  UTR data from anywhere.
- **Parents can write exactly two things: the season budget (and its
  expenses) and encouragement notes. Everything else is read-only.**
  Enforced at the RLS layer.
  Corrected 2026-11-15 — this said "read-only except the season budget",
  which omitted `encouragement_notes_insert_parent` and made the privacy
  policy wrong for a while.
  That policy's WITH CHECK was `is_family_member(family_code)` — "any
  approved member", despite the name — so a sibling player could write a
  note the UI presents as from a parent. **Fixed in migration 033**: the
  writer's own `profiles.role` must be `'parent'` AND they must be an
  approved member. Attack-tested both ways on staging.
  Still true and still flatter than it sounds: `is_parent_member()` grants
  budget writes to any approved joiner regardless of `role`. Check
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
- **Local dev shares production's real Supabase project.** Never sign in
  through real auth locally without a clearly-fake, disposable account —
  and delete it (and everything it touched) immediately after testing.

## Commands

```
npm run dev              # local dev server, localhost:3000
npx vitest run            # full test suite
npx tsc --noEmit           # typecheck
npx next build              # production build (rm -rf .next first if you
                             # hit a stale-cache module error — known
                             # flaky issue, not a real bug)
npx next lint                # lint
```

Migrations and Supabase type generation are done via the Supabase MCP's
`apply_migration` / `generate_typescript_types` tools. **There are two
projects now:**
- `gnlcpnsweqbtwpaqhqqg` — **staging.** Safe to apply to. Holds clearly-fake
  test users (`*@test.example`) and family `TESTFAMILYA`.
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
