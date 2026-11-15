# Seeded — TODO

Short, ordered, and about *what happens next*. `docs/MASTER_ROADMAP.md`
stays the full picture with acceptance criteria; this file is the queue.

Last updated 2026-11-14.

---

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
- [ ] Let `/api/whop/webhook` through the maintenance middleware on `main`
      (one-token matcher change, §K step 4) before attempting any replay.
- [ ] Replay the missed `membership.activated` events, or reconcile the two
      existing customers by hand.
- [ ] Run the $0 promo-code end-to-end test (§K) on staging.

---

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
