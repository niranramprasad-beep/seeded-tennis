# Seeded — notes for Claude

## Current state (2026-11-26)
- Production is seededtennis.com. `main` auto-deploys to it with no staging gate. Old branches live on as `archive/<name>` tags.
- **Herdy's branches (`herdy-work`, `herdy-colours`, any he creates) are his. Never touch them.** No delete, merge, rebase, push, PR close or conflict fix, and never in a "clean up branches" sweep (Niran, 2026-11-22). If your work conflicts with his, adapt your branch or tell Niran.
- Production database: every migration through **054**. Check `list_migrations` on `tfpjssmhiptbwigarxpx`, not this line.
- Catalog phase 1 is ON in production (`NEXT_PUBLIC_CATALOG_PHASE1_ENABLED=true`). Fed by the owner's College Tennis UTR Database sheet: 63 ACC + SEC programs with a sourced range (floor = lower quartile, middle = median), 43 Program Info rows, 587 roster players, 141 staff (counted 2026-11-24). The sheet feeds the one catalog (`lib/catalog/merge.ts`).
- `School.city/state/usNewsRanking` can be null ("Not tracked"). Render UTR numbers with `utrSourceLabel()` / `teamRangeNote()`, never the bare estimate label.
- Staging `gnlcpnsweqbtwpaqhqqg` has the same schema. `.env.local` and Vercel Preview point at it. It has only 3 official rosters, so Preview roster sections are mostly empty.
- Week of 2026-11-24: Herdy is the main developer. Niran is away.
- Open: a real Google sign-in test and Supabase/Google OAuth settings (Niran); post-checkout sync; the `Player.currentUTR` number|null refactor; the privacy policy's adult/lawyer review. See `docs/TODO.md`.
- Branch flow: short-lived branch from `main`, then PR, CI `verify`, Vercel Preview, merge. `v1` is retired.
- History: `docs/archive/ROADMAP_HISTORY.md` (what merged when) and `docs/archive/CLAUDE_INVARIANT_HISTORY.md` (why each rule exists). Tests and migration headers cite both.
- New here? `README.md`, then `docs/README.md`, then `docs/REVIEWER_GUIDE.md`.
- The GitHub repo is **public** for the 2026-11-21 review and goes **private** after it (Niran's call). Write every commit, doc and test as if it is public: names only, never a secret or a real person's data.

## Branches
**Branch from `main`, open a PR into `main`.** `main` = production and is
protected: a PR and a green `verify` are required. Merge only after CI passes
and Niran says go in the current turn — `main` auto-deploys to
seededtennis.com with no staging gate, which is why that gate is a person.
Migrations go to production *before* the code that needs them (HANDOFF §J "How to ship a migration to production").

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
- Run `rm -rf .next && npx tsc --noEmit && npm run lint && npx vitest run` before saying something works.
- Use one fit-band path: `classifySchoolFit` must always get a projection that can return "out-of-range".
- Show "Not tracked" for missing data — except on school pages, where an untracked field is left out instead (Niran, 2026-11-27). Show the source and date next to any roster number.
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
- **4-tier fit model**: Safe bet / Good match / Stretch / Long shot on
  screen (internal keys likely / target / reach / out-of-range; Niran,
  2026-11-27), per `/methodology`, in `lib/school-fit.ts`. Never say "band"
  to a player. Fit is judged on the player's stored Plan UTR
  (`planGoalUtr`) while it applies, else the estimate. Stretch-vs-Long-shot
  uses a real UTR-trajectory projection, never a static snapshot.
- **College players' UTRs and every team number (floor, middle, top) show as
  whole numbers only ("12.xx")**: roster ratings are cut on the server
  (`lib/db/roster.ts`), team numbers print through `formatTeamUtr`, and no
  screen prints an exact distance to a team line. The player's own numbers
  stay exact (Niran, 2026-11-27; `lib/fit-words.test.ts`).
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
  expenses) and encouragement notes. Everything else is read-only.** This is
  enforced in RLS, not the UI. A note or budget write needs the writer's own
  `profiles.role = 'parent'` **and** approved family membership (migrations
  033 and 050). `parent_reports` has no client INSERT (039). The database, not
  the app, stamps `family_code` on a joiner's rows (036). Check `pg_policies`,
  not this file. Full history: `docs/archive/CLAUDE_INVARIANT_HISTORY.md` §A.
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

- `emptyPlayer.currentUTR` is **0**, and `currentUTR <= 0` means "no rating
  logged yet". It is an **in-memory sentinel only**: the database rejects it
  (`profiles_current_utr_check` and `utr_entries_utr_check` allow 1–16.5).
  `writeCurrentPlayerProfile()` converts it to null. **Never write
  `player.currentUTR` straight to Postgres.** `lib/utr-sentinel.test.ts` fails
  the build if the conversion is removed.
- Anything derived from the UTR must check `hasRealUtr()` first. Use
  `hasRealUtr(v)` / `formatUtrOrNotTracked(v)` from `lib/utils.ts`, never
  `formatUTR` or `.toFixed()` on a raw `currentUTR`.
- The real fix is `Player.currentUTR: number | null`. Still open (139 uses in
  38 non-test files, re-measured 2026-11-21) — see `docs/TODO.md`.
- Why: a review found the coach email saying "My UTR is 7.0" for a player who
  never entered one (2026-11-15). Story: archive §B.

## Enforced invariants (short form)

Each line is a rule that is **done and must stay done**. The reasons, incidents
and rehearsal notes are in `docs/archive/CLAUDE_INVARIANT_HISTORY.md` §C. Keep
this list in sync with `docs/MASTER_ROADMAP.md`.

**Honesty (guard tests fail the build)**
- No invented coach names, emails, recruits, ranks or URLs
  (`lib/db/schools-catalog-honesty.test.ts`). Roster numbers are labelled via
  `UTR_RANGE_SOURCE_LABEL`; real fix is sourced data.
- Every sentence in the coach email traces to a value the player entered or to
  the school's name/division/conference. UTR is "(self-reported)". Every part
  names its stored source (`COACH_EMAIL_SOURCES`); Copy/Gmail stay disabled
  while any `[` or `]` remains (`coachEmailActionState`).
- Untrue claims are removed and guarded by `lib/copy-honesty.test.ts`. **When a
  claim becomes true, delete its entry from that test in the same commit — don't
  reword around it.**
- "Remind them" sends nothing: Seeded has no email or push. Don't let copy
  imply otherwise.
- `tournaments_planned` ("Tournaments planned this season") is optional and has
  **no default**, ever (`lib/no-invented-goal.test.ts`). Tournament verdicts
  need the draw's average UTR; there is no level-to-UTR table.

**Fit**
- Never pass `undefined` as the projection to `classifySchoolFit` (it returns
  "reach" for every school below the floor). Use `whatIfProjectionFor()`,
  `syntheticUtrHistoryFor()` or `realisticPaceProjectionFor()`
  (`lib/fit-band-consistency.test.ts`).
- With no Plan UTR set, the estimate plans with min(own pace,
  `PLANNING_PACE_CAP_PER_YEAR` = 1.5/yr), in `lib/fit/pace.ts`. A set Plan
  UTR judges fit as typed (`activePlanUtr`, DECISIONS 2026-11-27).

**Environments and migrations**
- Local dev and Vercel Preview read staging; production has its own three
  Supabase vars. Two env files are tracked (`.env.example`,
  `.env.local.example`) and hold placeholders only. Re-run the two greps for the
  project refs rather than trusting this file.
- Every repo migration through 054 is on production. Check `list_migrations`.
  Order, per-step verify and pasteable rollbacks: `docs/HANDOFF.md` §J.
- 035 is not optional (without it 032/033 break every profile write and 034
  breaks `delete_my_account()`). 036 does not ship without 037, 038 and 039.
  030 + 031 (a RESTRICTIVE policy on 21 tables) need their pre-flight check.
- Two traps when verifying RLS: `postgres` bypasses RLS, so also
  `set local role authenticated`; and restoring a dropped SECURITY DEFINER
  function re-grants EXECUTE to PUBLIC/`anon`, so follow with revoke/grant.
- A function used in an RLS policy must keep EXECUTE for `authenticated`.

**Family and privacy**
- Join only through `join_family()`; never write `parent_accounts`, `families`
  or a joiner's `profiles.family_code` directly.
- Never scope a family query by `profiles.family_code` and never read another
  user's `profiles` row. Use `resolveMyFamilyCode()`,
  `approvedFamilyMemberIds()` and `loadFamilyRosterRows()` from
  `lib/db/family-scope.ts`; the roster comes from `family_members()`.
  Guards: `family-scope.test.ts`, `family-roster-shape.test.ts` (a lint, not a
  proof).
- `lib/auth.ts`'s `familyCode: profile.family_code` stays the raw column (it
  round-trips on save). Never restore the
  `playerMember?.currentUtr ?? player.currentUTR` fallback
  (`lib/family-utr-honesty.test.ts`).
- Rows written while a family request is PENDING stay `family_code = NULL`, so
  owner-scoped reads filter by `.in("user_id", ...)`, not by the stamp.
- Family plan: it locks in RLS (042); one plan unlocks the payer's home family
  only, max 4 players and 2 parents (045, `FAMILY_PLAN_MAX_*`). A new family-wide
  unlock goes through `family_has_tier`; a new cross-member read policy needs the
  same ceiling (`lib/db/family-plan-lock.test.ts`).
- Parents prove their email before join/approve/consent (043), never via
  `auth.users.email_confirmed_at`. `birth_month` and `birth_year` are
  write-once (041). `leave_family()` (046) is the only way to leave.
- Under-13 accounts are inert until an adult consents, enforced by RLS on 21
  tables. The one exception is `join_family()`. Nothing claims to verify that
  anyone is an adult, and the copy says so.
- Deletion deletes (`delete_my_account()`); a full export exists at
  `/api/account/export`. **The privacy policy is not Claude's to write**: it
  still needs a lawyer or adult review.
- Cannot be fixed in this repo (Supabase settings): auth rate limits and
  leaked-password protection. Don't write them up as fixed.

**Billing**
- Prices live only in `TIER_PRICE_USD` (lib/types): Player $12/mo, $99/yr;
  Family $19/mo, $159/yr. The new Family monthly equals the OLD Player monthly,
  so a grep for "19" finds both.
- Never delete `WHOP_PLAN_PLAYER` / `WHOP_PLAN_FAMILY` (legacy plans, resolve
  only). The Whop webhook never delivered until it was fixed in code; the
  dashboard steps are Niran's (HANDOFF §K). `plans.list` needs `account_id`.
- No AI feature ships in V1. The Gemini and Stripe routes are deleted; their
  keys still need revoking at the provider.
