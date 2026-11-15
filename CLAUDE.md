# Seeded — notes for Claude

## Branches
**Work on `v1`.** `main` = production; only merge to `main` after CI passes
and Niran says go.

`v1` is the single line of development (renamed from `docs/production-audit`
on 2026-11-11). It already contains every commit on `main`, so there is never
anything to merge *up* — only down, when Niran says so. `main` auto-deploys
to seededtennis.com with no staging gate, which is why that gate is a person.

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
- P0-5: production is in **maintenance mode** since 2026-11-14 (`main` @ `d059006`, one revertable commit adding `middleware.ts`, verified live 503). The broken `contacted` write no longer reaches users. Real close-out is the `v1` merge.
- P0-6: **PARTLY done, and the dangerous half is still open.** Staging is
  `gnlcpnsweqbtwpaqhqqg`, a verified nine-category schema clone, and Vercel
  **Preview** genuinely reads it (proved by grepping the deployed client
  chunks: staging ref present, production ref absent). Production has its own
  three Supabase vars.
  **BUT `.env.local` on this machine still points at PRODUCTION**
  (`tfpjssmhiptbwigarxpx`), verified 2026-11-14. Setting Vercel's
  *Development* environment only affects `vercel dev` / `vercel env pull`;
  `npm run dev` reads `.env.local`, which was last changed on 2026-11-08.
  **So local dev still reads and writes real users' data, and CLAUDE.md said
  otherwise for several hours.** The §0 rule stands and matters: never sign
  in through real auth locally. Fix is in docs/OVERNIGHT_REPORT.md under
  "What Niran does by hand".
- **Eleven migrations are applied and attack-tested on STAGING and none are on production:** 025, 022, 023, 026, 024, 027, 028, 029, 030, 031. Order, per-step verify and per-step rollback: `docs/HANDOFF.md` §J. Nothing ships until Niran says go.
  The highest-risk step is 030 + 031 — a RESTRICTIVE policy on 21 tables. Its pre-flight check (every existing `profiles` row `consent_status = 'not_required'`, zero `'pending'`) is not optional.
- Family linking: `completeFamilySignup()` goes through `join_family()` only — never write `parent_accounts`, `families`, or a joiner's `profiles.family_code` directly; the database rejects all three. Migrations **023 + 026 and the code ship together**; neither half works alone. Approval flow: anyone joining lands PENDING and reads nothing until an approved member approves.
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
  policy wrong for a while. Two related notes: that policy's WITH CHECK is
  `is_family_member(family_code)`, so despite the name **any approved member
  can write a note, not only a parent**; and `is_parent_member()` likewise
  grants budget writes to any approved joiner regardless of `role`. The
  trust model inside an approved family is flatter than this bullet implies.
  Check `pg_policies`, not this file, before relying on it.
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
