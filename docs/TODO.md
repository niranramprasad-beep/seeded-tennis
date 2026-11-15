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

## A parent cannot read a JOINED player's profile or UTR history (found Night 2, TASK B)

**This is a product bug, not a security hole — it denies access rather than
granting it — but it is the reason `/family` looked like it worked.**

What I found while taking the real `/family` screenshots: `/family` rendered

    Robin's recruiting · Class of 2028 · Junior fall
    7.0  UTR

for a staging family whose parent had no UTR at all (`current_utr` is NULL
in the database). The 7 came from the `emptyPlayer` placeholder via
`playerMember?.currentUtr ?? player.currentUTR`, where `player` is the
signed-in PARENT. That fallback is fixed (see the commit, and
`lib/family-utr-honesty.test.ts`), and `/family` now says "Not tracked" and
shows an explicit "no player has joined yet" state.

**But the reason `playerMember` was undefined in the first place is the real
bug, and it is not fixed:**

- `join_family()` / `approve_family_join()` link the joiner through
  `parent_accounts` and deliberately leave their `profiles.family_code` NULL.
  Verified on staging after a real approval through the UI:
  `profiles.family_code` = NULL, `parent_accounts.status` = 'approved'.
- The `profiles` read policy is
  `family_members_read: (family_code IS NOT NULL) AND is_family_member(family_code)`.
  A NULL family_code can never satisfy it.
- So **a parent can never read the profile of a player who JOINED** — only
  of one whose own profile carries the family code (the account-holder path).
- `utr_entries_select_family` has the same shape
  (`EXISTS (... owner.family_code IS NOT NULL AND is_family_member(...))`),
  so the joined player's UTR history is unreadable too.
- `matches`, `coach_outreach` and `tournament_entries` carry their own
  `family_code` column instead and do not have this problem — which is why
  the feature looked half-alive.

This means the ordinary flow — a parent creates the account, the player joins
with the code — produces a `/family` page that can show none of the player's
real numbers. Before tonight that emptiness was disguised as the parent's own
placeholder data, which is why it was never noticed.

`lib/legal/policy.ts` says "A parent who has been approved into a family can
see the player's profile, UTR history, match results, tournaments, saved
schools and outreach progress." That is the INTENDED behaviour and the
permitted one; for a joined player it currently does not happen. It
over-states access rather than under-stating it, so it is not a privacy
problem, but it should be true before launch.

**Why I did not fix it tonight:** the fix widens what one user may read about
another. The candidate is to have `family_members()` (SECURITY DEFINER,
already the roster source) also return the approved player's `current_utr`
and `graduation_year`, and to give `utr_entries` a family-read path that goes
through `parent_accounts` rather than `profiles.family_code`. Both change
cross-user visibility for minors' data and deserve the same attack-test
treatment as 027/030 — not a 1am change made by the person who found it.

**Suggested fix, in order:** (1) decide whether the joiner's
`profiles.family_code` should simply be set on approval, which would make
every existing policy work unchanged and is by far the smallest change —
check first why 023/026 deliberately left it NULL, because there may be a
takeover reason (032 blocks claiming a taken code on INSERT, which suggests
there is); (2) if it must stay NULL, widen `family_members()` and add a
`parent_accounts`-based read path for `utr_entries`; (3) attack-test both
directions — a non-member, and a PENDING member — before believing either.

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
