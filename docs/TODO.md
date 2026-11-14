# Seeded — TODO

Short, ordered, and about *what happens next*. `docs/MASTER_ROADMAP.md`
stays the full picture with acceptance criteria; this file is the queue.

Last updated 2026-11-14.

---

## Blocking the production rollout

### 1. ⛔ Rewrite `completeFamilySignup()` in `lib/auth.ts` for migration 023
**Needs sign-off — this changes how family linking works.**

023 is applied and tested on staging. It closes P0-2, and in doing so it
breaks parent signup in three specific places in that one function. Full
detail in `docs/HANDOFF.md` §J under "HARD BLOCKER"; in short:

- the `families` lookup used to validate a join code now returns nothing
  to a non-member → call `join_family()` RPC instead and branch on its
  returned status (it returns, it does not throw)
- the direct `parent_accounts` upsert is now rejected → delete it, the RPC
  creates the row
- the `profiles` upsert writes `role`/`family_code`, which 022 rejects on
  the UPDATE half of an upsert → split create from update

Plus a UI question that is genuinely a product decision, not a code one:
**a parent is now `pending` until the player approves.** There is no
approval screen anywhere in the app. Someone has to design what the parent
sees while waiting and where the player accepts. Until that exists, a
parent can sign up and then sit in limbo.

### 2. Point Vercel Preview + local Development at staging
The other half of P0-6. Staging now exists and is a verified schema clone
of production, so there is no longer a reason for local dev to read real
users' data. Set the three `NEXT_PUBLIC_SUPABASE_*` / service-role names to
the staging project for **Preview** and **Development** only; Production
keeps its own.

### 3. Branch protection on `main`
`.github/workflows/ci.yml` exists and runs typecheck/lint/tests/build, but
a workflow only reports. Until `verify` is a required status check, nothing
stops a direct push. Steps in `docs/DEPLOYMENT_CHECKLIST.md`.

### 4. Revoke the removed credentials
Gemini key at Google, Stripe secret in Stripe, rotate Whop. Removing an env
var does not invalidate a credential.

---

## Next, once the rollout lands

5. **P1-FIT-4** — the last `classifySchoolFit` call with no projection
   (`seeded-pre-auth-onboarding.tsx:44`). `syntheticUtrHistoryFor()` is the
   ready-made fix. Signed-out `/schools` currently reads "Reach 37".
6. **P1-FIT-3** — projections are still nonsense on noisy data ("Projected
   4.3" for a 5.81 player). Needs outlier rejection and a floor.
7. **P1-DATA-1** — real roster import (migration 012, reserved). Still the
   highest-value product task: a 5.81 player has zero schools in range and
   every roster number reads "Unverified estimate".
8. **P1-UX-2** — delete Legacy. It is the last place with its own copy and
   its own coach view, and every honesty guard has to cover it twice.
9. **P1-SEC-3/4** — rate limits on `/api/*` and security headers. Note 023
   added rate limiting for family joins specifically; nothing else is
   throttled.
10. **P0-8** — minors' privacy, consent, real deletion. Needs legal/adult
    review. Deletion still doesn't delete; the UI now says so honestly.

---

## Smaller things worth not forgetting

- Regenerate `lib/db/database.types.ts` after 023 lands on production —
  `parent_accounts` gained `status`, `approved_at`, `approved_by`.
- `generate_family_code()` exists in the DB but nothing calls it;
  `generateFamilyCode()` in `lib/auth.ts` still uses `Math.random()`.
- Self-host the `next/font` Google fonts. The build intermittently fails
  fetching them; CI retries 3× as a workaround (P2).
- Pricing comparison table at 390px: 640px table in a 350px scroller, only
  the Free column visible, no scroll affordance (P2).
- Test fixtures use real school names ("Duke") against the clearly-fake
  rule in CLAUDE.md. Low risk, pure-logic tests, but worth tidying.
- Staging holds three clearly-fake test users (`*@test.example`) and one
  family `TESTFAMILYA`, left in place deliberately as seed data.
