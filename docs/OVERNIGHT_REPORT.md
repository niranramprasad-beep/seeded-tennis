# Overnight run — 2026-11-14/15

## 🔴 READ THIS SECOND — the verifier found a live Google button on a public page

An independent verifier checked every "Done when" against the code rather
than against this report. **18 PASS · 6 PARTIAL · 1 FAIL.**

**The FAIL:** `components/seeded/onboarding/seeded-pre-auth-onboarding.tsx`
hand-rolled its own "Continue with Google" button, called `signInWithGoogle()`
directly, and had **zero** references to the feature flag. It rendered on the
**public** `/onboarding` page with `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` unset.

That is the exact bug Task 2 claims to have found and fixed — in a fourth
file. And my test for it was worthless: it iterated **three hand-picked
filenames** in `components/auth/`, so it asserted what I already believed
rather than what was true. A plain `grep -rn signInWithGoogle` finds it in
one second.

**Fixed:** the page now renders the shared, guarded `GoogleButton`. The test
now greps the whole repo and requires exactly one caller
(`auth-card.tsx`), plus a second check that any file mentioning the Google
label imports the guarded component.

**It changes the morning plan.** Hand-off step (b) said "set the flag last,
after enabling the provider" — that ordering protected nothing while the
pre-auth button was live with the flag off. It is real again now.

### Three more things the verifier was right about

1. **The `next` vulnerability is 25 advisories, not one.** I read the first
   one `npm audit` printed, verified its two sub-claims, and generalised.
   "Both currently unreachable" is **withdrawn** — several are in scope for a
   Vercel App Router app. `next@16` moves to the top of Week 1. Correction in
   `docs/DECISIONS.md`.
2. **A privacy-policy claim was false.** "Parents are read-only everywhere
   except the season budget" — `encouragement_notes_insert_parent` lets them
   write notes. Worse, that policy checks only `is_family_member()`, so
   **any** approved member can, not just a parent. Fixed in the policy, in
   CLAUDE.md's non-negotiables, and the policy test now fails when a section
   cites no checkable path (which is why that section had nothing checked).
3. **My webhook payload test checked a string, not behaviour.** The readers
   are now in `lib/whop-payload.ts` and the test calls the real ones.
   Mutation-tested: breaking `planIdOf` fails 5 of 9; restoring passes all 9.

Also fixed: `/terms` ended a sentence with the literal text "is at /privacy"
— now a real link, in both renderers.

Still open and honestly so: the `/family` screenshots are of
`/dev/family-preview` (Task 6 says so; Task 2's evidence list did not), and
rate limiting remains advisory because PostgREST is reachable directly.

---

## 🔴 READ THIS FIRST — a Critical hole in my own work, found and fixed

An independent review agent found that **the entire family approval gate
could be bypassed in one statement.** Migration 022 locks `family_code` on
UPDATE; its INSERT branch leaves it alone. Any signed-up account with no
profile row yet could INSERT one carrying **someone else's family code and
`role='parent'`** and become an approved member instantly — a minor's name,
email, birth year, GPA, UTR and full history, every member's email and
consent status including an under-13 sibling's, and write access to the
season budget.

The only thing holding the door was `lib/auth.ts` politely not doing it. A
comment I wrote in that file asserted the database would reject it. **The
database would not.** That is the failure worth remembering from tonight:
I verified the UPDATE path and assumed the INSERT path, and wrote the
assumption down as though it were a check.

Fixed in `032_block_family_code_on_profile_insert.sql`, applied to staging,
attack-tested twice — once by the reviewer, once by me independently. The
attack now raises `42501`; creating a family, joining honestly (still lands
PENDING, reads nothing) and ordinary profile updates all still work.

**Two consequences for the rollout:**

1. **032 is now HANDOFF §J step 9**, before the code merge. Apply it in the
   same window.
2. ⚠️ **It is already committed under a misleading message.** My `git add -A`
   swept it into `3bc07ac` ("Task 6: E2E on staging…") while the review was
   still running, so the file travels with any `v1` → `main` merge whether or
   not the migration has been applied. I did not rewrite pushed history to
   extract it; §J step 9 and this note are the fix.

Full detail: `docs/SECURITY_REVIEW_INDEPENDENT.md` (S-17 through S-21 in
`docs/SECURITY_CHECKLIST.md`).

---

## Night 2 in five lines (2026-11-15)

1. **Seven tasks done (A–G).** Next 15.5.29 with **zero production
   dependency vulnerabilities**; rate limits moved into the database;
   two controls the product described but did not enforce made real; the
   entire rollout rehearsed end to end; the launch pages taken from **202
   accessibility violations to 0**; and two independent review passes.
2. **Tests 574 → 624. Readiness 79 → 84.** `tsc`, `lint`, the full suite
   and a production build are green at every commit.
3. **Two independent review passes found three Criticals in my own work,
   and all three were real.** Migrations 032/033 broke *every profile write
   in the app*; 034 broke *account deletion for every user*; and the
   sentinel I introduced to fix a dishonest coach email violated a **live
   CHECK constraint on production**, which would have broken every profile
   write again. All three reproduced on staging before being fixed.
4. **The rehearsal found four defects in the rollback half of the plan** —
   including step 8's, which could never have run at all. The plan now has
   runnable SQL everywhere and measured timings (218 ms forward).
5. **Nothing was applied to production and nothing was merged to `main`.**
   `main` is still `d059006` serving the 503. Production was read-only
   throughout.

**The honest headline:** every Critical tonight was introduced by me while
fixing something else, and none was caught by my own testing — each took an
independent pass. Night 1's reviewer found a family-takeover hole; Night 2's
found that the fix for it broke every profile write; the verifier then found
that *my fix for that* broke them again a different way. **Three nights,
three fixes that carried new Criticals.** The pattern is not bad luck: it is
that I verify the path I was thinking about and assume the rest. The review
step is the only thing that has caught any of it.

<details>
<summary>Night 1's summary (2026-11-14)</summary>

## The night in five lines

1. **Seven tasks done, one running.** Fonts self-hosted (builds no longer
   touch the network), the Whop webhook's real payload field found and fixed,
   Google sign-in built end to end, auth/pricing/family rebuilt to spec, the
   fit report now projects to junior year, and a privacy policy whose claims
   the build checks. An independent security review is still running.
2. **Tests 512 → 568.** `tsc`, `lint`, full suite and production build green
   at every commit; the build now passes three times in a row where it used
   to fail about one run in two.
3. **Two bugs found that would have shipped silently:** the webhook reads
   `variant_id`, not `plan_id` (every delivery would have granted nothing),
   and the Google button rendered with its feature flag **off**.
4. **One thing I got wrong and corrected:** CLAUDE.md said local dev no
   longer touches production. It does. `.env.local` was never repointed.
5. **Readiness: 68 → 79.** Nothing was applied to production, nothing was
   merged to `main`, and `main` is still `d059006` serving the 503.
6. **One Critical, found by a reviewer who did not write the code** — see the
   box above. Three smaller findings fixed or documented. This is the
   strongest argument tonight for the review step being worth its cost.

---


</details>

## 1. WHAT NIRAN DOES BY HAND

Three items. Two of them are the last things you do, after the deploy is
live.

### 🔴 Blocks launch

**a. A lawyer or an adult reads `/privacy` and `/terms`.** The mechanisms
are all built and tested — deletion really deletes, the export is complete
and guarded, under-13 accounts are inert until an adult consents, and the
copy claims no verification we do not do. The document that explains this to
a parent, names the processors and states retention is the half that is not
code, and it is not mine to sign off. Seven specific questions are in
`docs/TODO.md`, headed by the one that could change the product: whether our
consent mechanism satisfies COPPA's *verifiable* parental consent. It may
not.

### 🔴 The last two things, in this order, after the deploy is live

**b. `support@seededtennis.com` must exist and be monitored.** The privacy
policy tells parents to use this address for requests about their child. A
published address that bounces is worse than no address at all.

**c. `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` in Vercel → Production.** The
very last step. Without it the Google button does not render — which is
deliberate, so the button cannot appear before the deploy that supports it.

### 🟡 Before the first paying customer

**d. Decide on CAPTCHA** for signup and password reset (backlog item in
`docs/TODO.md`). Leaked-password protection stays deferred per your call —
it is Pro-only.

### ✅ Done since the last report — nothing needed from you

- ~~**Point `.env.local` at staging.**~~ **Done, and verified tonight:** the
  URL resolves to `gnlcpnsweqbtwpaqhqqg`, with zero occurrences of the
  production ref in the file. Local dev no longer touches real users' data.
- ~~**Enable the Google provider in Supabase.**~~ Already enabled. The
  Google Cloud redirect URI is
  `https://tfpjssmhiptbwigarxpx.supabase.co/auth/v1/callback` and **must
  stay that way** — Supabase handles the OAuth round trip and then redirects
  on to `seededtennis.com/auth/callback`, which the existing
  `https://seededtennis.com/**` allowlist entry already covers. Do not
  "fix" the Google Cloud URI to point at seededtennis.com.
- ~~**Google consent-screen privacy/terms URLs.**~~ **After launch** — the
  pages must be live before Google will accept them. `/privacy` and
  `/terms` ship in this release.
- The 4 new Whop plan IDs are in Vercel for Production, Preview and
  Development; the 2 legacy IDs are Production-only, which is correct (no
  checkout ever sells them).

## 2. WHAT CLAUDE RUNS AFTER "GO"

Nothing below has been started. **This whole sequence was rehearsed end to
end on staging on 2026-11-15** against a database rolled back to
production's exact 23-migration shape and seeded with prod-shaped data —
every pre-flight, every verify, and every rollback. Timings below are
measured, not estimated. Full detail in `docs/HANDOFF.md` §J and §K.

⚠️ **Before running a single verify step, read §J's note on `set local role
authenticated`.** In the Supabase SQL editor you are `postgres`, and
`postgres` bypasses RLS — a verify that counts rows returns everything and
looks like a pass no matter what the policies say. With the role switch, an
approved parent sees 1 profile row; without it, 12. I hit this mid-rehearsal
and briefly recorded the wrong number.

**Step 0 — Backup.** Supabase → Database → Backups, note the timestamp.
*This IS the rollback for everything that follows — and note that running
every documented rollback still does NOT return the schema to its
pre-rollout shape (16 functions, 13 columns and a table stay behind, by
design). The PITR checkpoint is the only true undo.*

**Steps 1–12 — Migrations, in this exact order**, verifying after each.
Total measured database time: **218 ms**. The time is not the risk; the
reading between steps is.

| # | Migration(s) | ms | Pre-flight that must not be skipped | Rollback |
|---|---|---|---|---|
| 1 | `025` | 30 | expect a no-op on prod | nothing to undo |
| 2 | `022` | 9 | `git show main:lib/auth.ts` writes no locked column | `drop trigger profiles_protect_privileged` |
| 3 | `023` + `026` | 47 | every existing `parent_accounts` row backfills to `approved`, count matching the pre-count | restore policies + the two pre-023 helpers + `drop table family_join_attempts` (all now literal SQL in §J) |
| 4 | `024` | 6 | count Free accounts already holding >3 targets | drop the trigger and **drop** `coach_outreach_write_own` — do NOT recreate it, prod has no such policy |
| 5 | `027` | 5 | 1 production row is `privacy_level='public'` — that person loses nothing they use | recreate the policy; `badges`/`friendships` stay locked |
| 6 | `028` | 16 | additive | drop function + table |
| 7 | `029` | 1 | **0 rows have `deletion_requested_at`** (checked read-only — nobody is owed a manual deletion) | drop function; a completed deletion is not reversible |
| 8 | `030` + `031` | 73 | **🔴 the one that matters: every row `not_required`, zero `pending`.** One `pending` row means a locked-out account — stop. | drop the 21 restrictive policies FIRST; then the restores, which need `drop function family_members()` before recreating it (it raises `42P13` otherwise) and a `revoke`/`grant` pair after |
| 9 | `032` | 5 | — | restore 035's trigger body, not 032's literal text |
| 10 | `033` | 7 | — | §J step 10, now runnable SQL |
| 11 | `034` | 19 | **the only step that can refuse an ordinary user's write** — watch it after deploying | drop 20 triggers + 3 functions; **also revert `lib/rate-limit.ts` to `consume_rate_limit` or every write 429s** |
| 12 | `035` | 12 | **not optional, and it is the one that makes 032/033/034 safe.** Without it: every profile write fails for a user with no UTR (23514 on a live CHECK), the upsert path raises 23502/42501, and `delete_my_account()` dies on a foreign key for everyone. Seven acceptance checks run on staging. | §J step 12 |

**Step 13 — The code.** PR `v1` → `main` **including `git revert d059006`**
(the maintenance middleware), wait for `verify` to pass, merge. Never bypass
the ruleset. *Rollback: Vercel → promote the previous production deployment,
then run 024's rollback SQL.*

**Step 14 — Live checks on seededtennis.com:** 200 not 503, signup, login,
Google login, onboarding, under-13 consent, family join + approve, fit
report, outreach gating, pricing toggle.

**Plus four the reviews added, each because something real broke there:**
- **Rename yourself in Settings** — 032/033 broke this (23502/42501 on the
  upsert path).
- **Delete a throwaway account** — 034 broke this (foreign key on the
  cascade), and it is P0-8's whole mechanism.
- **Sign up WITHOUT entering a UTR, then edit your profile** — the `0`
  sentinel broke this (23514 against a live CHECK constraint), and it is
  also the account shape a parent creates.
- **Open `/events`, `/plan` and a school page as that same account** — these
  are where the sentinel was printing "UTR 0.00", "needs about 7.1/year" and
  "You 0.0 · Gap to median −12.1".

**Step 15 — Whop.** Send a test `membership.activated` from the dashboard,
expect **200**. Then replay the missed events. ⚠️ **The webhook is reachable
only after step 13** — the maintenance middleware 503s it, which is why the
earlier test delivery got a 503. If replay does not reconcile
`mem_xZKHm92QxEIqsS` (the bullis.org Player membership, metadata intact), I
set `subscription_tier='player'` and `whop_membership_id='mem_xZKHm92QxEIqsS'`
on that profile with the service role. **That path is rehearsed:** a
service-role write goes through the 022/033/035 trigger, while the same
write from a browser session is refused `42501`.

**Step 16 — The $0 purchase**, walked through together. Full script in
`docs/HANDOFF.md` §K: 100%-off promo on `plan_iWNSNKqks0ddp`, confirm $12 →
$0, complete it, then check the tier in the database, the webhook delivery,
and that `/outreach` unlocks.

## 3. OPEN ITEMS, SORTED

**Blocks launch**
- A lawyer or an adult reads `/privacy` and `/terms` (above)
- `support@seededtennis.com` live (above)
- `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`, last (above)
- The production rollout itself (§J, now 16 steps and rehearsed)

**Found Night 2, open, and worth a decision before launch**
- **A parent cannot read a JOINED player's profile or UTR history.**
  `approve_family_join()` leaves the joiner's `profiles.family_code` NULL
  and both read policies require it non-null, so the ordinary family flow
  gives a `/family` page with none of the player's real numbers. It denies
  access rather than granting it, so nothing is exposed by waiting — but it
  makes the parent view hollow for most families. Three candidate fixes,
  cheapest first, in `docs/TODO.md`. All of them widen cross-user reads for
  minors, so each needs the 027/030 attack-test treatment.
- **`/sample-report` reports no First Contentful Paint**, so Lighthouse and
  PageSpeed score it 0 although the page renders correctly and fast. A
  measurement anomaly on a marketing page; bisect plan in `docs/TODO.md`.
- **`/onboarding`'s server HTML is a spinner** — the pre-auth flow only
  renders after hydration, so a crawler without JS sees nothing. It is the
  top of the funnel at sitemap priority 0.9.

**Week 1**
- Reconcile the bullis.org membership if replay misses it
- `next@16` — clears the last critical + high in production deps, both
  currently unreachable (no `remotePatterns`, zero `next/image`,
  Vercel-hosted; postcss is build-time only)
- Browser-path E2E for signup/OAuth/checkout/export
- CAPTCHA decision
- **Make `Player.currentUTR` nullable.** Tonight's fix made the placeholder
  a detectable sentinel (`0`, which the codebase already reads as "not
  logged"); making the state unrepresentable is still the better fix and
  still a 79-site change.

**Later**
- Nonce-based CSP (drops `'unsafe-inline'`; needs middleware)
- P1-DATA-1 real roster import — still the highest-value product work
- P1-UX-2 delete Legacy · P1-UX-1 theme flips · P1-FIT-3 noisy projections
- Error tracking: still 1/10, and the billing outage is what that looks like
- Mobile performance 73–81, limited by LCP; measure the real deployment
  before optimising
- `/dev/family-preview` seeds the old `CHEN-7K4P` code format

---

> Per-task log below. Read this plus `git log` before resuming anything.

## Step 0 — Whop permission check: **PASS**

The rolled API key works. Nothing secret printed or stored.

| Call | Result |
|---|---|
| `plans.list({product_ids})` | ✅ 200 |
| `memberships.list({account_id})` | ✅ 200 — 2 memberships |
| `memberships.list({product_id})` | ✅ 200 |
| `webhooks.retrieve({id})` | ✅ 200 |
| `webhooks.list({account_id})` | ✅ 200 |

Webhook `hook_ActwvOQFQX4Pm` confirmed: `api_version: "v1"`,
`api_version_date: "2026-11-14"`, `enabled: true`,
`consecutive_failures: 0`, `last_failure_at: null`, three membership events
subscribed, URL `https://seededtennis.com/api/whop/webhook`.

Live Whop checks are therefore **in scope** for this run.

### What the key revealed — a real bug, found before it could bite

The v1 `2026-11-14` membership resource carries the plan as **`variant_id`**.
Not `plan_id`, not `plan.id` — the two shapes the webhook handler was written
to accept. Every delivery would have resolved to "unknown plan" and granted
nothing, silently, exactly like the original failure.

Fixed and covered in TASK 1.

The two real memberships, for the record:

| membership | status | plan | metadata |
|---|---|---|---|
| `mem_xZKHm92QxEIqsS` | `active` | `plan_TdtqfjDqtjGOq` (legacy Player $19/mo) | has `supabase_user_id` ✅ |
| `mem_YpNhxjIhCPxycx` | `canceled` | `plan_8ybt0oV8kZ79m` (legacy Family $39/mo) | has `supabase_user_id` ✅ |

Both carry checkout metadata, so reconciliation needs no email fallback.

---

## TASK 0 — Build reliability + dependency security: **DONE**

### Fonts: self-hosted, build no longer touches the network

`app/layout.tsx` now uses `next/font/local` for all six families, from 12
committed latin-subset woff2 files in `app/fonts/` (310 KB total). Variable
files where Google publishes one, static files for the two families without.

**Evidence — three consecutive clean production builds:**

```
build 1: PASS (132/132)
build 2: PASS (132/132)
build 3: PASS (132/132)
```

Previously this failed roughly one run in two; it took down a real
production redeploy of `main` on 2026-11-14.

**Evidence — fonts render identically.** Screenshots:
`docs/screenshots/task0-fonts-before-pricing.jpg` and
`…-after-pricing.jpg`. Verified in the browser rather than by eye:

```
fontFacesLoaded: 18          (6 families + 6 metric-adjusted fallbacks)
anyGoogleSrc:    false       ← no @font-face points at gstatic/googleapis
h1Font:          __interTight_2d7d99, …
monoFont:        __jetbrainsMono_01c7d9, …
```

`grep -rn "next/font/google"` returns only the comment explaining why not to
go back.

CI retry removed — `.github/workflows/ci.yml` runs `npm run build` once.

### Dependencies

| | before | after |
|---|---|---|
| **Production deps** | 1 critical, 4 high, 0 moderate (**5**) | 1 critical, 1 high (**2**) |
| All deps incl. dev | 3 critical, 11 high, 10 moderate (**24**) | 3 critical, 6 high, 8 moderate (**17**) |

Fixed in production deps: `nanoid`, `source-map-js`, `zod` — all via
`npm audit fix` with no `--force` and no major bumps.

Removed as unused (zero references outside `package.json`): **`geist`**,
**`pdf-lib`**.

**The two remaining production vulnerabilities are both unreachable here,
and both need a Next.js major to clear:**

- `next` (critical) — DoS via Image Optimizer `remotePatterns`. We configure
  no `remotePatterns`, import `next/image` in **zero** files, and run on
  Vercel, not self-hosted. The advisory is specific to self-hosted apps.
- `postcss` (high, transitive via `next`) — XSS in CSS stringify output.
  Build-time only, over our own CSS, never shipped to a browser.

`next@14.2.35` is already the latest 14.2.x, so no patch exists inside the
major. Recorded in `docs/DECISIONS.md` and `docs/TODO.md`.

### Verification

`tsc` clean · `lint` clean · **512 tests pass** · build 3/3.

### Files

`app/layout.tsx`, `app/fonts/*` (12 new), `.github/workflows/ci.yml`,
`package.json`, `package-lock.json`, `docs/DECISIONS.md`,
`docs/screenshots/task0-fonts-{before,after}-pricing.jpg`.

### Open issues

None.

---

## TASK 1 — Whop webhook payload compatibility: **DONE**

### The bug, and why nothing could have caught it

The handler read the plan as `plan_id ?? plan?.id`. The 2026-11-14 membership
resource has **neither**. Whop's 2026-11-14 API renamed plans to variants, so
the field is **`variant_id`** — ids unchanged, still `plan_`-prefixed.

Every delivery would have resolved to "unknown plan", granted nothing, and
returned 200. The same silent nothing as the original outage, one layer
further in — and it would have looked like the webhook was working.

The existing tests all passed, because every one of them used a payload
shape someone had invented.

**Confirmed against the live API**, not reasoned about: a read of
`mem_xZKHm92QxEIqsS` at `api_version_date: 2026-11-14` returns
`variant_id`, `product_id`, `status`, `metadata` and no `plan_id` anywhere.

### What changed

- `@whop/sdk` **2.1.0 → 2.8.1**. The upgrade independently confirms the
  rename — it moved `plan_id` → `variant_id` on `Membership`,
  `ListMembershipsRequest` and `CreateCheckoutConfigurationsRequest`, and
  typecheck failed on all three until they were updated.
- `app/api/whop/webhook/route.ts` — `variant_id ?? plan_id ?? plan?.id`, so a
  webhook pinned to an older version still works. Email reader widened to
  `member.email ?? member.user.email ?? user.email ?? email`, since the live
  resource has no top-level email and `member` is often null.
- `app/api/whop/checkout/route.ts` — `variant_id` on checkout creation.
- `app/api/whop/sync/route.ts` — `variant_id` filter and field.

### Tests: 512 → 521

New `lib/whop-webhook-payload.test.ts`, built on the **recorded** resource
shape (field names verbatim from the live API, values faked):

- `membership.activated` / `.updated` / `.deactivated`, each correctly
  signed, unwrapped through the real verifier, resolving to the right tier
- all six plan ids resolved from a real-shaped payload
- **the regression stated as a test**: the old `plan_id ?? plan?.id` reader
  returns `null` on this payload and resolves to `"free"`, while the current
  reader returns `"player"`
- a pre-2026-11-14 payload still resolves
- a payload whose `variant_id` is swapped after signing is rejected
- a guard asserting the route still contains the same readers, so the test
  cannot drift into testing its own local copy

### Verification

`tsc` clean · `lint` clean · **521 tests pass** · production build passes.

### Open issues

None. Re-record the fixtures if the webhook's `api_version_date` is ever
changed — the test file says so at the top.

---

## TASK 2 — Launch polish: **DONE**

### Google sign-in, end to end

Built, not stubbed:

- `lib/config/auth.ts` — the flag, the callback path, and `safeRedirectPath`
  for `?next=`. **6 tests** on the redirect alone: `//evil`, `/\evil`,
  absolute URLs, `javascript:`, control characters. An open redirect on an
  OAuth callback is worth more than on any other page — the victim arrives
  having just authenticated, from a link that genuinely started on our domain.
- `app/auth/callback` — the one place that exchanges a code. Three outcomes:
  provider error → `/login` with a readable message (never the raw
  `invalid_grant` at a 15-year-old, never a blank page); no profile →
  `/auth/complete`; profile → in, honouring a safe `?next=`.
- `app/auth/complete` — **the no-bypass step.** Google gives an email and a
  name; it does not give a birth year, a role or a family. It calls
  `completeOAuthProfile`, which calls the same `ensureSupabaseProfile` the
  email path calls, with the same arguments — so the under-13 consent
  trigger, `join_family()` and the 022 column lock all apply because it is
  the same code, not because it was remembered twice. An under-13 Google
  signup gets the same forced family-join path.
- `flowType: "pkce"` set explicitly on the Supabase client. An auth flow that
  changes shape under a library patch bump is not one to leave implicit.

**A bug this caught.** The flag check lived in `AuthCard`, and
`signup-flow.tsx` renders `<GoogleButton>` directly — so **/signup showed the
button with `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` unset.** Found in a 375px
screenshot, not by a test. The guard now lives inside `GoogleButton` and
`GoogleDivider`, and `components/auth/google-button-flag.test.ts` fails the
build if it moves back out or a fourth caller reimplements the button.

Verified both ways: flag unset → no button on `/login` or `/signup`; flag set
→ "Continue with Google" renders (dev server, `find` result).

### Rebuilt to docs/DESIGN_MOCKUP_SPEC.md

- **New `AuthCard`** — centred 420px card, H2 + subline, Google first, "or"
  divider, 44px/16px inputs (16px because iOS Safari zooms below it), spec
  error banner. `/login`, `/signup` and `/auth/complete` share it; they each
  had their own card width, input sizing and error treatment before, which is
  how they drifted.
- **`/pricing`** — spec headline and subline, Yearly default, mono 40px
  prices, "About $8.25 a month" / "Or $159 a year" notes, 2px court border on
  Family, "What stays free, always" section, spec taglines.
- **`/family`** — invite box on the muted panel with a dashed border and the
  code in mono bold; approval items use the clay tint for the most urgent and
  the muted panel for the rest. The design tokens already matched the spec's
  hex values exactly (`--c-clay-tint-bg` = 251 237 230 = #FBEDE6).
- **`/signup`** — "I am the" Player/Parent pill radio.

### Two copy claims I would not ship

The spec's pricing footer reads *"Cancel in two clicks. Accounts for players
under 18 are billed to a parent."*

Nothing checks who owns the card — a 16-year-old can pay with their own — so
the second sentence describes a control that does not exist, and the first
measures Whop's UI, which we do not own. Shipped instead: *"Cancel any time
from your Whop account. Players under 13 need a parent or guardian to approve
the account before it works"* — which is enforced, in the database, by
migration 030. Both originals are now patterns in `lib/copy-honesty.test.ts`.

Likewise the toggle: the mockup's "2 months free" understates the real saving
(3.75 months on Player, 3.6 on Family), so it reads "3 months free" from
`yearlyMonthsFree()` — floored, minimised across tiers, true for both, and it
moves when a price does.

### Sweep

`grep '\$19|\$39|\$12|\$99|\$159'` across `app/` and `components/`
returns **only comments** explaining the history — no hardcoded price renders
anywhere. No `lorem ipsum`, no `TODO:`/`FIXME` in UI. The "coming soon"
strings on school pages are honest empty states for P1-DATA-1.

### Evidence

8 screenshots in `docs/screenshots/`: `task2-{login,signup,pricing,family}-{desktop,mobile}.jpg`.

**Console on those pages:** clean apart from `/_vercel/insights/script.js`
and `/_vercel/speed-insights/script.js` 404s, which only happen under a local
`next start` — those endpoints exist only on Vercel. Not CSP blocks; the CSP
allows them as same-origin.

**One thing that looked like a bug and was not:** `/login` at 375px read as
blank in the first screenshot. It is the `animate-fade-in` on route change
being captured mid-animation — the DOM has the full form, confirmed by
reading it directly. Recorded so nobody chases it again.
`prefers-reduced-motion` is already handled globally in `app/globals.css`.

### Verification

`tsc` clean · `lint` clean · **533 tests pass** · production build passes.

### Open issues

- The `/dev/family-preview` harness seeds the old `CHEN-7K4P` code format,
  which P0-2 replaced. Dev-only route, 404s in production. Logged in TODO.

---

## TASK 3 — Fit report trajectory: **DONE**

### The headline number

Class of 2031, UTR 9.0, women's — the case the brief names:

| | programs in range (likely + target) |
|---|---|
| **Today** | **8** |
| **By junior year (2029)** | **31** |

Bands today read Reach 23 · Target 8 · Likely 0. It was never "all reaches"
after P1-FIT-4, but 8 of 31 were missing, because the report was answering
"where are you now?" to a 13-year-old when the question is "where will you be
when coaches look?".

Screenshot: `docs/screenshots/task3-trajectory-2031-utr9.jpg`.

### Deterministic, and it says so

`lib/fit.ts` — current UTR, a grade, three constants. Same inputs, same
answer, checkable with a pen. **No model produces any number.** A model may
write a sentence about them; it may not produce one.

`lib/config/growth.ts` is the only place growth assumptions live, and its
header says in as many words that they are assumptions and not data —
Seeded has no longitudinal UTR dataset, and presenting a guess as a forecast
would be the invented-coach-emails failure (P0-3) in a shape that is harder
to notice. Slow/normal/fast are the ends and midpoint of
`REALISTIC_UTR_IMPROVEMENT_PER_YEAR` (0.5–1.5/yr), the band the methodology
page, the what-if slider and the pace warning already use — one band, not a
second opinion.

The UI never shows a projected number alone: an **Estimate** chip, "Assumes
typical growth of 1.0 UTR per year", and "Seeded has no growth data for
junior players yet, so this is an assumption, not a forecast."

Plus the line the brief asks for, verbatim, from one constant: *"Recruiting
usually happens junior year — this shows where you're headed, not just where
you are."*

### The two rules that make it honest

- **A junior or senior gets their current rating back at every pace.** They
  are being recruited now; projecting growth onto them would invent a better
  player than the one coaches are looking at, in the months when that matters
  most. The panel says so instead of showing a forecast.
- **No UTR produces `null`, not a default.** There is no honest projection
  from a number we do not have, and a caller that forgets to handle it breaks
  loudly rather than rendering a guess. The panel shows "No rating yet — we
  won't guess one for you."

Projections are also capped at the per-gender realistic ceiling, and say so
("capped at the top of college tennis") rather than showing a suspiciously
round number with no explanation.

### Tests: 533 → 553

`lib/fit.test.ts`, 20 cases, every date injected. Covers each case the brief
names: Class of 2031 UTR 9, 2027 UTR 11 (senior), 2028 UTR 6, a current
junior, missing UTR, out-of-range UTR — plus determinism and one-decimal
rounding (UTR publishes two; a projection carrying two implies precision the
assumption does not have).

**A correction worth recording:** my first draft of this test file guessed
the grade arithmetic and was a year out on every case — at the pinned date
the school year is 2027, so Class of 2028 is a **junior**, not a sophomore.
The brief's "Class of 2028, UTR 6" and "a current junior" are the same
player. Fixed by reading `getCurrentGrade` rather than reasoning about it,
and the file now lists the grades at the top.

### Verification

`tsc` clean · `lint` clean · **553 tests pass** · production build passes.

---

## TASK 4 — Privacy policy + terms (draft): **DONE — REQUIRES LEGAL/ADULT REVIEW**

`/privacy` is new; `/terms` now points at it instead of carrying a
one-paragraph stand-in. Linked from the footer, the settings privacy card,
the homepage footer, the pre-auth signup form, the signup wizard's final
step, and both parent-consent cards.

### Every claim is sourced, and the build checks it

The content is **data**, in `lib/legal/policy.ts`, and each section carries a
`source` naming the file or migration that makes it true.
`lib/legal/policy.test.ts` (15 tests) then checks the code still does what
the policy says:

| policy claim | what the test checks |
|---|---|
| deletion is immediate | `029` contains `delete from auth.users`, and the route's zod schema has no `cancel`/`request` action |
| under-13 accounts are inert | `030` has `as restrictive for all to authenticated` + `account_active()` |
| nothing is publicly visible | `027` drops `profiles_discovery_read` |
| Seeded never sends coach email | `lib/db/schools.ts` references no Gmail API |
| the processor list is complete | Supabase, Vercel, Whop, Google Analytics, Google all named |
| no removed processor is listed | no Gemini, Stripe or OpenAI anywhere |
| no email promise | no "we'll email you" (P0-7's rule) |
| no claimed verification | no "verified parent", and it says "cannot verify" explicitly |
| no retention promise we don't keep | no "within N days" |

It also checks every file path cited in a `source` exists — which caught two
mistakes in my own test (a regex that truncated `.tsx` to `.ts`, and a
`"cancel"` check matching a comment rather than code).

A privacy policy that drifts from the product is the most expensive kind of
stale copy: a written promise about children's data that nobody re-reads
after the code changes underneath it.

### What it says, in short

Everything stored and why (birth year exists for exactly one reason — the
under-13 check); that nothing is visible to any other user and there is no
public profile or directory; that under-13 accounts do nothing until an adult
approves, enforced in the database; that **Seeded cannot verify anyone is an
adult, and whoever approves is stating it**; the five processors and nothing
else; that coach email is a compose link we never send; that deletion is
immediate and irreversible; and that export is two clicks away with no reason
required.

### ⚠️ Not reviewed by a lawyer

`docs/TODO.md` now carries seven specific items, headed by the one that could
change the product: **whether our consent mechanism satisfies COPPA's
"verifiable parental consent" at all.** It may not. If it does not, the
options are real verification or refusing under-13 accounts — and that is a
decision for an adult, not for me.

Also flagged: `support@seededtennis.com` must exist and be monitored before
launch, because the policy tells parents to use it for requests about their
child.

### Verification

`tsc` clean · `lint` clean · **568 tests pass** · build passes (`/privacy`
renders at 187 B static).

---

## TASK 6 — End-to-end pass: **DONE, with one route not tested and why**

### ⚠️ The finding that stopped half of this task

**`.env.local` still points local dev at PRODUCTION** (`tfpjssmhiptbwigarxpx`),
verified 2026-11-14. Setting Vercel's *Development* environment only affects
`vercel dev` / `vercel env pull`; `npm run dev` reads `.env.local`, which was
last changed on 2026-11-08.

So I did **not** sign up a test account through the UI. Doing so would have
created a real account, with real rows, in the production database — the
exact thing CLAUDE.md §0 rule 5 forbids. **CLAUDE.md itself claimed the
opposite** ("Local dev no longer touches real users' data"); I wrote that
line earlier today on the strength of the Vercel setting, and it was wrong.
Corrected in this commit.

Fix is the first item under "What Niran does by hand".

### What I did test — 26 checks on staging, all passing

Against the real database with all eleven migrations applied together, which
had not been done before (they were verified one at a time as they landed).

| # | Check | Result |
|---|---|---|
| 1–8 | Structure: 21 restrictive consent policies present, `profiles_discovery_read` gone, `are_friends` dropped, rate limiter and `delete_my_account` present, `family_members()` returns `consent_status`, RLS on every public table | ✅ |
| 9 | Parent-first: a parent creates the family (the path an under-13 needs) | ✅ |
| 10 | Under-13 signup lands `pending` **even when the insert asks for `granted`** | ✅ |
| 11 | Pending account reads nothing but its own row | ✅ |
| 12 | Pending account can still join a family (the RPC is SECURITY DEFINER) | ✅ |
| 13 | Outreach gating: free tier blocked by `has_tier('player')` | ✅ |
| 14 | Parent approves → join **and** consent recorded in one action | ✅ |
| 15–17 | Consented child can write, can read its family, rate limiter answers | ✅ |
| 18–21 | Stranger sees 0 families, 0 other profiles, 0 minor UTR rows, and cannot consent for the child | ✅ |
| 22–24 | Child deletes own account → auth user and UTR history gone | ✅ |
| 25–26 | Family survives because the parent is still in it; parent untouched | ✅ |

**One result differed from what I predicted, and the difference is fine:**
check 21 returned `not_a_parent_account` rather than `not_your_family`. The
stranger has no profile row at all, so the role check fires before the family
check. The attack is refused either way; I am recording the reason the
database actually gave rather than the one I expected.

All E2E fixtures were deleted afterwards — by calling `delete_my_account()`
as those users, which also exercised the "last member out removes the family"
path. Staging is back to its 6 seed accounts.

### UI checks that need no auth

- `/pricing` toggle, prices, honest footer — verified on a production build
- `/login`, `/signup`, `/auth/complete` render; Google button appears with the
  flag on and is absent with it off
- `/onboarding` fit report with the trajectory panel — 8 → 31 programs
- Mobile 375px on `/pricing`, `/login`, `/signup`, `/family` (harness) —
  screenshots in `docs/screenshots/`

### Not tested, and honestly so

Email signup → onboarding, Google OAuth round trip, checkout start, and the
settings export/delete buttons all need a signed-in session. They are
**covered at the database and unit level** (26 checks above, plus 568 unit
tests including the export-completeness and consent guards), but the browser
path from button to row has not been walked. It needs `.env.local` pointed
at staging first. Listed for the morning.

---

## TASK 7 — Self-check: **one real gap found and closed**

I re-read the whole brief against what is on disk, "Done when" by "Done
when". Everything held except one thing:

**Task 2 asked for before/after screenshots. I only had "after."** I had
started editing `/login`, `/signup`, `/pricing` and `/family` before
capturing the originals, so the before state was gone from the working tree.

Recovered rather than hand-waved: Vercel still hosts the preview for commit
`20a3632`, which is the last build before Task 2 touched any of those pages.
Screenshotted it. `task2-login-desktop-BEFORE.jpg` shows the old glass panel
with no Google button; `task2-pricing-desktop-BEFORE.jpg` shows the old
"Start free. Upgrade when you're ready to commit." headline. Genuine before
state, from a real deployment, not a reconstruction.

Also re-confirmed in this pass:

| Claim | Re-checked |
|---|---|
| 3 clean builds with local fonts | re-ran; `grep -rn "next/font/google"` returns only the comment |
| no hardcoded prices | grep returns comments only |
| 2031/UTR-9 no longer "all reaches" | 8 → 31, read off the running app |
| Google flag works both ways | button absent with flag unset, present with it set |
| staging E2E fixtures cleaned up | `e2e-%@test.example` → 0 rows |
| `main` untouched | `origin/main` = `d059006`, site still 503 |

A second, independent verifier agent is now checking every "Done when"
against the code and the running app rather than against this report. Its
findings go to `docs/VERIFICATION.md`.

**Final run:** `tsc` clean · `lint` clean · **568 tests across 43 files** ·
production build passes.

---

## TASK 5 — Independent security review: **DONE**

Report: `docs/SECURITY_REVIEW_INDEPENDENT.md`. **1 Critical · 1 Medium ·
3 Low · 2 Info**, every one reproduced on staging before being written down.
Production was never touched.

| # | Finding | Status |
|---|---|---|
| **S-17** | **Critical** — family takeover + minor-data exposure via the `profiles` INSERT path | **Fixed (032), attack-tested twice** |
| S-18 | Medium — the under-13 gate is skipped by *omitting* `birth_year` | **Not fixed, deliberately** — see below |
| S-19 | Low — `findProfileIdByEmail` passed a Whop-supplied email to `.ilike()` as a *pattern*; `%@gmail.com` would attach a paid tier to a stranger | **Fixed on `v1`** + regression test |
| S-20 | Low — 8 API routes return raw Postgres `err.message` | Open (S-10 already covers it) |
| S-21 | Low — rate limiting is advisory; PostgREST is reachable directly with the same token | Open |
| S-22 | Info — `families` INSERT is open to any authenticated user; `is_parent_member()` grants budget writes to any approved joiner regardless of role | Open |

**On S-18, why I did not fix it.** Requiring `birth_year` at the database
layer would break signup entirely if any path forgot to send it — a worse
failure than the one it prevents. It is also the inherent limit of
self-declared age: a child who lies defeats any such gate, which is exactly
why the privacy policy says we cannot verify. It is a product and legal call
and it belongs with the open half of P0-8, not with me at midnight.

**On S-19, why it is mine.** I wrote that line, and my own test for it used
literal addresses, so it never exercised a wildcard. The new test's stub
implements real LIKE semantics — otherwise it would have been checking a
string compare and passing for the wrong reason.

**Verified clean, so it need not be redone** (evidence in the report): anon
access, tier and consent escalation via INSERT, the UPDATE lockdown, tier
gating, all 18 SECURITY DEFINER functions, a pending joiner self-approving, a
minor self-consenting, webhook spoofing and replay, `/api/whop/sync`
self-granting, all 11 API routes for IDOR, the OAuth open redirect, secret
leakage, and the CSP.

**Advisors on staging: no new warning categories.** The SECURITY DEFINER
count moved 17 → 18 and the eighteenth is the reviewer's own
`family_code_is_taken()`.

---

# NIGHT 2 — 2026-11-15

## TASK A — Next.js security upgrade: **DONE** (committed `2ae5f8c`)

Full reasoning is in that commit message and `docs/DECISIONS.md`. Summary:
next 14.2.35 → **15.5.29**, which clears every critical and high `next`
advisory; postcss pinned to 8.5.x through an `overrides` entry to clear the
two highs next bundles. **Production dependencies: 29 advisories → zero.**
What remains (12) is dev-only — vitest, vite, tinypool, brace-expansion —
and none of it ships. One breaking change bit: `params` is a Promise in
Next 15, so `app/schools/[slug]/page.tsx` awaits it.

Evidence: three consecutive clean production builds, all 34 routes
smoke-tested for non-200s (zero), console clean apart from the Vercel
Analytics 404s that only occur under a local `next start`.

## TASK B — closing the PARTIALs from docs/VERIFICATION.md: **DONE**

| # | Item | Result | Evidence |
|---|---|---|---|
| B-1 | `birth_year` required on a client profile INSERT | **PASS** | 033; a client INSERT omitting it raises `23502`. The under-13 gate could previously be skipped by leaving the field out. |
| B-2 | Under-13 account still lands `pending` | **PASS** | Attack-tested on staging; `account_active()` false, all 21 restrictive policies deny. |
| B-3 | A player member cannot write an encouragement note | **PASS** | 033; the old policy's WITH CHECK said `is_family_member(...)` — "any approved member" — despite being named `..._insert_parent`. Now the writer's own `profiles.role` must be `'parent'`. |
| B-4 | An approved parent still can | **PASS** | Same migration, happy path on staging. |
| B-5 | Rate limits enforced in the DATABASE, not the route | **PASS** | 034; a BEFORE INSERT/UPDATE/DELETE trigger on 20 tables. Direct PostgREST writes that bypass every API route are now limited. |
| B-6 | The limit is the limit | **PASS** | Exactly 20 direct `utr_entries` writes allowed, the 21st raises `53400`. |
| B-7 | One user's limit does not affect another | **PASS** | Second staging user unaffected at the first's ceiling. |
| B-8 | Real `/family` screenshots, not `/dev/family-preview` | **PASS — and it found a bug** | See below. `docs/screenshots/taskB-family-real-{desktop,mobile}.png`, captured through a real sign-in as a staging parent against staging data. |

### B-8 found a fabricated number on a live screen

The whole point of banning the `/dev/family-preview` fixture was that a
fixture agrees with whatever you believe. The first real capture showed:

    Robin's recruiting · Class of 2028 · Junior fall
    7.0  UTR

for a parent account whose `current_utr` is **NULL in the database**. The
7 is the `emptyPlayer` placeholder (`lib/data/user.ts`, `lib/auth.ts:455`),
reached through

    const currentUTR = playerMember?.currentUtr ?? player.currentUTR;

where `player` is the signed-in PARENT. The class year was the parent's own
`graduation_year`. None of it was any player's data, and the UTR was
nobody's. That is the first non-negotiable rule in CLAUDE.md, on a launch
screen, shipped.

**Fixed, at the source rather than the pixel:**

- `lib/db/family.ts` — `FamilyMember.currentUtr` is `number | null`. It was
  `Number(row.current_utr ?? 0)`, which turned "unknown" into a confident
  0.0 for any member without a rating.
- `lib/family-budget.ts` — `buildSeasonBudgetSummary` and
  `pendingSkipDecisions` take `number | null`. Both compute tournament fit
  verdicts FROM the UTR, so a placeholder produced real-looking "bad fit"
  chips for a rating nobody entered. With null they omit the verdict.
- Four view files lose the `??` fallback and print **"Not tracked"**:
  `seeded-family-overview`, `seeded-family-budget-view`,
  `seeded-weekly-report-view`, and the legacy `parent-dashboard-view`
  (still reachable from the footer and Settings → Appearance).
- `/family` gains an explicit **"Your family — no player has joined yet"**
  state instead of rendering the parent's own row as the player's. This is
  the ordinary under-13 path, where the parent creates the account first,
  so it is a first-run screen rather than an edge case.
- `classifySchoolFit` is never called with a substituted number — the
  projection is null and the fit section is skipped, keeping the
  one-fit-path rule intact.

**`lib/family-utr-honesty.test.ts`** guards it, and the guard was wrong
twice before it was right:

1. First version used `\s` in a `git grep -E` pattern. `git grep -E` is
   POSIX ERE, where `\s` matches **nothing** — the search silently returned
   no hits and the test passed happily with the bug reintroduced.
2. Fixing the regex immediately exposed a **fourth** offending file I had
   not fixed (`seeded-family-budget-view.tsx`).
3. The second version anchored on `^[^:]*:[0-9]+:`, git grep's output
   prefix, which never matches file content — vacuous again.

It is now mutation-tested: reintroducing the bug in each of the four files
is caught in each of the four. **This is the third time this run that I
wrote a test that asserted nothing and only found out by deliberately
breaking the code. Mutation-test the guard, every time.**

### What B-8 did NOT fix — read this

Chasing why `playerMember` was undefined turned up a real product bug that
is **not** fixed and is written up in full in `docs/TODO.md`:

**A parent cannot read a JOINED player's profile or UTR history at all.**
`approve_family_join()` leaves the joiner's `profiles.family_code` NULL
(verified on staging after approving through the real UI), and both
`family_members_read` and `utr_entries_select_family` require
`family_code IS NOT NULL`. So the ordinary flow — parent creates the
account, player joins with the code — yields a `/family` page that can show
none of the player's real numbers. Before tonight that emptiness was
disguised as the parent's placeholder data, which is exactly why nobody
noticed.

It denies access rather than granting it, so it is not a security hole. I
did not fix it because the fix widens what one user may read about another
minor, and that deserves the same attack-test treatment as 027/030 rather
than a 1am change by the person who found it. TODO.md has the three
candidate fixes in order, starting with the cheapest (find out why 023/026
deliberately left `family_code` NULL — 032 suggests there is a takeover
reason).

### Verification

`rm -rf .next && npx tsc --noEmit && npx next lint && npx vitest run` —
tsc clean, lint clean, **580 tests** (574 + the 6 new honesty tests), production build passes.
Migrations 033 + 034 are applied to **staging only**; rollback steps are
`docs/HANDOFF.md` §J steps 10 and 11.

## TASK C — full launch dress rehearsal on staging: **DONE**

The whole rollout was executed against a database rolled back to
production's exact 23-migration shape, seeded with prod-shaped fake data,
then replayed forward step by step with every pre-flight and verify as
written. Full detail, timings and the corrected SQL now live in
`docs/HANDOFF.md` §J under "The 2026-11-15 dress rehearsal".

### How the rehearsal substrate was built, and why it is not a fresh copy

The brief asked for a staging *copy*. The Supabase org is on the **free
plan** with both of its two projects already in use (production and
staging), so a third project and database branching are both unavailable —
and each would be a billing action I would not take unattended anyway.

Instead the rehearsal ran on staging itself, rolled backwards to the
baseline using **the plan's own rollback SQL**, in reverse order. That turned
out to be better than a fresh copy: it satisfied "run each step's ROLLBACK at
least once" with the real rollbacks against real objects, and it is what
surfaced three of the four defects below. The baseline was then verified
against production directly: **all 23 tables matched production
column-for-column**, and 5 of 9 fingerprint categories matched byte-for-byte.

### Seed data (clearly fake, `@example.com`, RFC 2606)

A player with no family; a parent holding a family code; a player who JOINED
that family through `parent_accounts`; a minor (grade 6); and an account
carrying a `whop_membership_id`. 12 profiles, 4 families, 4 parent_accounts.

### Every documented rollback ran. Four were wrong.

| # | Defect | Severity |
|---|---|---|
| 1 | **Step 8's rollback did not execute at all.** `create or replace` cannot restore the 8-column `family_members()` over 031's 9-column version — Postgres raises `42P13` and demands a `DROP FUNCTION` first. It failed on its first statement every time. Migration 031 itself does the drop correctly; only the rollback instruction forgot. | **High** — this is the rollback for the highest-blast-radius step, the one you reach for when accounts are locked out. |
| 2 | **Step 4's rollback created a policy production does not have.** It recreated `coach_outreach_write_own` with `has_tier('family')`, but 024 is what *creates* that policy; before 024 there is none. Verified on the prod-equivalent baseline. "Rolling back" would have left production in a shape it has never been in. | Medium |
| 3 | **Step 3's rollback never mentioned `family_join_attempts`**, a table 023 creates. | Low |
| 4 | **Restoring a dropped SECURITY DEFINER function silently re-grants EXECUTE to PUBLIC and `anon`.** `CREATE OR REPLACE` keeps existing grants; a fresh `CREATE` after a `DROP` does not. The rehearsal did exactly this to `are_friends()` and caught it only by diffing function ACLs against production. Every restore in §J now carries its `revoke`/`grant` pair. | **High** — a rollback that reopens anon access is worse than the problem it fixes. |

Two of §J's rollbacks were also prose ("restore the pre-023 helpers", "restore
026's `family_members()` verbatim"). At 3am during an incident, "restore it
verbatim from that file" is not a rollback. Both are now literal, runnable
SQL, taken from **production's own `pg_get_functiondef` output** rather than
from repo text that may have drifted.

### The forward replay: every step applied and verified

218 ms of database time for all eleven steps (per-step table in §J). Every
documented check passed on prod-shaped data:

- Production has exactly 23 migrations ✓
- Step 3: all 4 `parent_accounts` rows backfilled to `approved`, zero
  `pending`, count matching the pre-count ✓
- Step 4: zero free accounts already over 3 targets ✓
- Step 5: exactly 1 row with `privacy_level='public'` ✓
- Step 6: `consume_rate_limit('data_export')` → 3 allowed, 4th denied ✓
- **Step 8's mandatory pre-flight: all 12 rows `not_required`, zero
  `pending`** — nobody is locked out ✓
- Step 9: takeover INSERT raises `42501`; creating a family with a fresh code
  still works ✓
- Step 10: a player member writing a "parent" note refused `42501`; an
  approved parent still can ✓
- Step 11: exactly 20 direct `utr_entries` writes allowed, the 21st refused ✓

### The trap that would have made every verify a false pass

**In the Supabase SQL editor you are `postgres`, and `postgres` bypasses
RLS.** `set_config('request.jwt.claims', ...)` sets `auth.uid()` but leaves
you a superuser, so a row-count check returns everything and looks like a
pass. I hit this mid-rehearsal and briefly recorded "12 profiles visible to a
parent" as if it were a result. With `set local role authenticated` as well,
the real answer is **1**. §J now spells out the correct incantation. Any
verify in this plan run without it is worthless.

### What the rehearsal independently reproduced

On clean prod-shaped data, with RLS properly enforced, an approved parent can
read their joined player's roster row but **zero** of their UTR entries. That
is the TASK B finding (`docs/TODO.md`), reproduced from scratch rather than
inferred from the policy text.

### §K (billing)

Most of §K is Whop dashboard work and a live $0 checkout — neither is
rehearsable from here. The one step that is, **step 6, reconciling the two
real paying customers by hand with the service role**, was rehearsed on
staging and works: a `service_role` write sets `subscription_tier` and
`whop_membership_id` through the 022/033 trigger, while the same write from a
browser session is refused `42501`. Worth knowing before touching two
customers who have already paid twice for nothing.

### Preview code deploy

The TASK B commit (`d057bc8`) built green as a Vercel preview. Fetched over a
share link: **200**, with every security header present on a real deployment
rather than a local build — CSP, HSTS, `X-Frame-Options: DENY`,
Referrer-Policy, Permissions-Policy, COOP, `X-Content-Type-Options`, plus
`x-robots-tag: noindex` on the preview. Vercel env config confirms Preview
and Development both carry the **staging** `NEXT_PUBLIC_SUPABASE_URL`
(`gnlcpnsweqbtwpaqhqqg`) while production has its own three. I also grepped
42 deployed chunks for either project ref and found neither, so that check
was inconclusive and is **not** offered as evidence — the env configuration
is.

### State left behind

Staging is back in the full post-rollout state (28 functions, 21 restrictive
policies, 20 rate-limit triggers, 4 consent columns, 25 tables) with the
rehearsal fixtures still in place as seed data. The timing table was dropped.
Nothing was applied to production; the only production access in this task
was read-only introspection (`list_migrations`, `pg_policies`,
`pg_get_functiondef`, `information_schema`).

## TASK D — quality pass on 10 pages: **DONE**

Ten pages (`/`, `/onboarding`, `/signup`, `/login`, `/pricing`, `/schools`,
a school page, the sample fit report, `/today`, `/family`), each at 375px and
1440px, signed in where the page needs it. Automated with headless Chrome +
axe-core + Lighthouse; the harness lives in the session scratchpad.

### Accessibility: 202 axe violations → 0

| Rule | Impact | Before | After | Fix |
|---|---|---|---|---|
| `color-contrast` | serious | 127 | **0** | One token. `--c-stone-light` was 3.29:1 in light mode and 3.27:1 in dark, both under the 4.5 AA floor. |
| `nested-interactive` | serious | 74 | **0** | Each `/schools` row was a `role="button"` wrapping a checkbox, a star button and a link. |
| `scrollable-region-focusable` | serious | 1 | **0** | The `/pricing` comparison table scrolls horizontally at 375px and nothing could focus it. |
| **Total** | | **202** | **0** | |

**The contrast fix took two attempts, and the first one was wrong in an
instructive way.** I solved the token against white and got 4.67:1 — but the
text does not sit on white, it sits on cream (247,246,242) and the sidebar
panel (251,250,247). Re-measuring found it still failing at 4.32:1 and
4.48:1. Solving against the *darkest* surface it actually lands on gives
4.65:1 on cream, 4.81:1 on panel, 5.02:1 on white. Measure against the real
background, not the one you assume.

The `/schools` row fix replaces the row-as-button with a real chevron button
carrying `aria-expanded` and a name ("Show fit detail for Stanford"). The row
keeps its click as a mouse convenience. The `j`/`k` row highlight is
unaffected — it is a window-level handler and never depended on the row
being focusable.

**Keyboard:** 332 focusable elements across the 20 page/viewport
combinations were focused in turn; **every one has a visible focus ring**
(outline or box-shadow). No keyboard traps found.

### Lighthouse, mobile (4× CPU throttle, simulated slow 4G)

| Page | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| `/` | 77 | **100** | 96 | **100** |
| `/onboarding` | 75 | **100** | 96 | **100** |
| `/pricing` | 73 | **100** | 96 | **100** |
| `/schools` | 73 | **100** | 96 | **100** |
| `/schools/stanford-m` | 76 | **100** | 96 | **100** |
| `/login` | 81 | **100** | 96 | **100** |
| `/signup` | 79 | **100** | 96 | **100** |
| `/sample-report` | — | — | — | — | 

Accessibility was 98 on three pages before this pass and is 100 on all of
them now. The remaining 2 points came from `heading-order`, which my axe run
missed because it is a "moderate" rule outside the wcag2a/wcag2aa tag filter
I used — Lighthouse caught it. **One shared cause:** the footer's column
headings were `h4`, so every page ending in the footer jumped h1→h4 or
h2→h4. They are `h2` now; the visual size never came from the tag.

**Performance is 73–81 and the limiter is LCP (5.1–6.0 s simulated).** TBT is
0–10 ms and CLS is 0.09 or better everywhere, so the pages are not
janky — they are simply slow to paint the largest element under a 4× CPU
throttle. I did not chase this: it is a real number but an unthrottled local
`next start` is the wrong place to optimise against, and the honest next step
is to measure the production deployment. Noted rather than guessed at.

**`/sample-report` scores 0 in every category** because Chrome never reports
a First Contentful Paint for it. **This is a measurement anomaly, not a
broken page** — a screenshot under 4× CPU throttle shows it rendering
correctly, `first-paint` fires at ~100 ms, and the page has 1467 characters
of server-rendered text. Reproduced outside Lighthouse under three
conditions, with the fade-in animation and JS errors ruled out. Written up
in `docs/TODO.md` with the evidence and a bisect plan. It matters because
PageSpeed Insights will show 0 for a marketing page.

### SEO

**Before: 6 of 10 pages had no canonical URL, and `/pricing`, `/schools` and
every school page shared the site-wide default title** — all 68 school
pages competing as one page in search.

- `/pricing`, `/schools` and `/sample-report` gained titles, descriptions and
  canonicals.
- `/schools/[slug]` gained `generateMetadata`: "Stanford University men's
  tennis — Seeded", described from the school's own real fields. **UTR
  numbers are deliberately kept out of the search description** — they are
  unsourced estimates (P0-3), and a search snippet is the last place to
  present one as fact.
- `/today` and `/family` gained titles and `robots: { index: false }`, as
  belt-and-braces beside robots.txt.
- All 8 public pages now have a unique title, a description and a canonical.
  Lighthouse SEO is 100 across the board.

**robots.txt was protecting the wrong routes.** Its disallow list named
`/dashboard`, `/roadmap` and `/coaches` — the routes the Seeded rebuild
superseded — while `/today`, `/plan`, `/outreach` and `/events`, the live
auth-gated routes the 5-item nav actually points at, were all crawlable.
Nothing leaked (each redirects a signed-out visitor to `/login`), but Google
was being invited to the real private pages and warned off the dead ones.

The list is no longer hand-written: `lib/seo/private-routes.ts` is the single
source of truth, and `lib/seo/robots-coverage.test.ts` **walks every
`app/**/page.tsx`, follows its component imports, and fails the build when a
route whose tree renders an `AuthGate` is not disallowed.** It also asserts
no `/dev` route is crawlable and that the sitemap lists nothing robots
disallows.

Writing that test took three tries and each failure was worth keeping:
1. Matching the bare word `AuthGate` reported `/pricing`, `/login` and
   `/cost-calculator` as gated — they merely *reach* a file that mentions it.
   It now matches `<AuthGate` and follows only `@/components/...` imports.
2. That left `/onboarding` and `/cost-calculator`. `/onboarding` is
   genuinely public (a signed-out visitor gets the pre-auth flow; the gate
   only wraps the signed-in continuation), so it is an explicit exemption
   **with a written reason**, and a test asserts every exemption names a real
   route that really does render a gate.
3. `/cost-calculator` turned out to redirect to `/family` in the Seeded
   design, so a crawler is bounced to `/login`. It was in the sitemap as a
   public page; it is now disallowed and removed from the sitemap.

Mutation-tested both ways: removing `/today` from the private list fails the
build, and adding a bogus exemption for a page with no gate fails it too.

**The sitemap was missing the privacy policy** — the page Google's OAuth
consent screen will link to, and the one a parent goes looking for. Added,
along with `/methodology` and `/sample-report`.

### Error states

No blank screens and no raw error text on any of the 20 page/viewport
combinations: every page rendered between 185 and 5,953 characters of real
content, and none matched `TypeError|ReferenceError|undefined is not|Cannot
read propert|[object Object]|NaN`. The only console errors anywhere are the
Vercel Analytics and Speed Insights scripts 404ing, which happens only under
a local `next start` because those endpoints live on Vercel's edge.

### One thing noted and deliberately not changed

The home page has two `<h1>` elements — a mobile hero and a desktop hero with
different copy, each `display:none` at the other's breakpoint. Only one is
ever exposed, axe and Lighthouse both pass, and merging them would mean
rewriting the hero copy to serve both widths. Recorded rather than touched.

### Verification

tsc clean, lint clean, **589 tests** (580 + 9 new SEO coverage tests),
production build passes, Lighthouse accessibility 100 and SEO 100 on every
scoreable page.

## TASK E — independent review of tonight's changes: **DONE, and it found two Criticals in my own work**

A fresh agent that wrote none of this code reviewed commits `2ae5f8c~1..e8fc8df`.
It found **17 issues: 2 Critical, 2 High, 6 Medium, 7 Low** — and it was
right about the two that mattered most. I reproduced both against staging
before fixing them.

### Critical 1 — migrations 032 and 033 broke every profile write in the app

`writeCurrentPlayerProfile()` saves with supabase-js `.upsert()`, which
compiles to `INSERT ... ON CONFLICT (id) DO UPDATE`. **PostgreSQL fires
BEFORE INSERT row triggers for the whole statement before it detects the
conflict.** So the INSERT branch of `protect_privileged_profile_columns()`
runs on ordinary profile UPDATES, where `birth_year` is absent (the `Player`
type has no such field) and `family_code` is the user's own.

Reproduced on staging, as the signed-in user, on a row that already exists:

```
ERROR 23502: A birth year is required to create an account.    (033)
ERROR 42501: Use the join code to request access ...           (032)
```

`app/api/profile/route.ts` calls this "the single highest-traffic write path
in the app". **Renaming yourself in Settings would have failed with "A birth
year is required to create an account."** So would finishing onboarding,
saving a target school, logging a UTR check-in, and requesting deletion.

Note what this means about last night: 032 was *last* night's Critical fix,
found by *that* night's reviewer. The fix for one Critical introduced
another, and only a second independent pass caught it.

### Critical 2 — migration 034 broke account deletion, which is all of P0-8

`delete_my_account()` is SECURITY DEFINER but reads `auth.uid()`, and the
caller's JWT role is `authenticated`, so 034's service-role exemption never
applied to it. The reviewer predicted a rate-limit `53400` after 20 cascaded
`utr_entries`. **The actual failure, reproduced on staging, is worse and
hits every user regardless of how much data they have:**

```
ERROR 23503: insert or update on table "rate_limit_events" violates
foreign key constraint "rate_limit_events_user_id_fkey"
DETAIL: Key (user_id)=(...) is not present in table "users".
CONTEXT: ... delete from auth.users where id=v_user
```

As the cascade removes `auth.users`, the trigger tries to log a rate-limit
event for a user that no longer exists. The mechanism the privacy policy
promises — and the one a parent is most likely to use — was broken for
everyone.

### Both fixed by migration 035, with seven checks run on staging

| # | Check | Result |
|---|---|---|
| A | `.upsert()` on an existing profile, no `birth_year` | **allowed** |
| B | in-family user upserts carrying their own `family_code` | **allowed** |
| C | genuinely new profile claiming a taken `family_code` | still `42501` |
| D | genuinely new profile with no `birth_year` | still `23502` |
| E | new under-13 profile, self-granted paid tier | `pending`, tier scrubbed to `free` |
| F | `delete_my_account()` with 50 cascaded `utr_entries` | **succeeds**; profile, entries and auth user all gone |
| G | limiter still enforces | exactly 20 writes, 21st refused |

035 also raises the `training_write` bucket from 120 to 2000 (the calendar
re-upserts ~48 rows per save, so the limit sat below a single ordinary
save), and makes `consume_rate_limit` actually read `rate_limit_for_bucket()`
— which 034's own comment had claimed it already did and it did not.

### High — the placeholder 7 was reaching a college coach's inbox

The reviewer ran `buildCoachEmail` and got:

```
My UTR is 7.0 (self-reported).
```

for a player who has never entered one. My Task B commit said "fixed at the
source, not the pixel". **That was false.** I fixed four family views; the
source — `emptyPlayer.currentUTR = 7`, reached whenever `profiles.current_utr`
is NULL — was untouched. A minor was signing their name to a self-report
they never made, which is P0-4 broken as directly as it can be.

Fixed properly this time: the placeholder is **0**, which is not a valid UTR
and which `currentUTR <= 0` already means "not logged yet" throughout this
codebase (`lib/fit.ts:94`, and the note above `explainSchoolFit`). The coach
email now omits the sentence, the subject fragment and the signature line
entirely rather than inventing a rating; four display sites print "Not
tracked"; and the school-detail range bar omits the "you" marker instead of
parking it at 0%. Mutation-tested both ways.

### High — silent data loss on /events

`persist()` was `void save(...).catch(() => undefined)`. With writes now
refusable, the calendar would show an edit applied, the write would fail,
and nothing would say so. The error surfaces as a toast now. The optimistic
update stays — SWR corrects the view on focus — but the person is told.

### Medium — my own guards had holes, proved by construction

The reviewer built three gated-but-crawlable routes and **all nine of my SEO
tests passed**: a gate in `layout.tsx` (never read), a chain one level
deeper than my cap of 3, and a `dynamic(() => import(...))` the regex could
not see. A fourth by inspection: I filtered out every `[slug]` route.

All four are closed, and I replanted the reviewer's exact three cases to
prove it — the test now fails with `['/zztest-deep', '/zztest-dynamic',
'/zztest-layout']` and passes again once they are removed.

Two more weak guards strengthened: the rate-limit stub ignored the RPC name
(so switching `peek_rate_limit` back to `consume_rate_limit` left all tests
green — and that one word is the whole of 034's design), and the family-UTR
guard pinned one spelling of the bug, defeated by a rename. The rule is now
a pure function, `resolveFamilyPlayerFacts()`, with behavioural tests and
all four family views wired to it.

### Medium — "202 violations to zero" was true only for the default design

`--c-stone-light` is defined in **eleven** blocks in `app/globals.css`. I
fixed two and left nine legacy themes between 2.37:1 and 3.85:1, and those
themes ship — the legacy Settings view offers a theme switcher for all of
them. All nine are fixed now (every one ≥ 4.6:1 against its own block's
surfaces), and `lib/theme-contrast.test.ts` parses the real stylesheet and
checks every block, so the claim is verified by the build rather than
asserted by a commit message.

**My first measurement of those nine disagreed with the reviewer's and mine
was wrong.** I scanned a ±60-line window for each token's background, which
picks up a neighbouring theme's colours. With proper brace-depth parsing my
numbers matched the reviewer's exactly.

### Medium — /family was still borrowing the parent's data

Fixing `currentUtr` left `graduationYear` and `gender` still falling through
to the signed-in parent, so a parent's class year could print as the
player's (the original bug report named exactly that) and **a girl's UTR
trajectory could be projected with her father's growth curve.** Both fixed.
The subtitle also printed "on track for 0 of 5 targets" when the honest
answer is that we cannot tell; it now says so.

### Also fixed

- §J step 10's rollback was still half prose inside a ```sql fence — the
  exact defect Task C claimed to have fixed four of. Now runnable SQL.
- §J's "Risk: low, and strictly a tightening" for 033 was false. Corrected,
  with the upsert mechanism explained.
- `app/pricing/page.tsx` retyped four prices against CLAUDE.md's explicit
  rule; it derives them from `TIER_PRICE_USD` now.
- `robots: { index: false }` was on 2 of 13 private pages. It is on all of
  them, and the SEO test now checks — which immediately found four more
  (`/family/budget`, `/family/weekly-reports`, `/reset-password`,
  `/settings/billing`).
- Two stale CSS comments: one citing a colour (`rgb(30,38,33)`) that exists
  nowhere in the file, one asserting `--c-stone-light` "stays intentionally
  sub-4.5 ... never body text", which would have got the fix reverted.

### One correction to the reviewer

It reported **69** school pages against my "37". Both are wrong:
`getSchools()` returns **68** (37 men's, 31 women's), which is what
`generateStaticParams` builds. My "37" was the men's subset; its 69 was a
grep artifact across the three data files. CLAUDE.md's 68 was right all
along.

### What the reviewer confirmed

The Next 15 async-`params` migration is complete repo-wide; the new
`generateMetadata` is correct; the `/schools` `role="button"` removal broke
nothing (and the j/k claim is literally true); `/cost-calculator` really is
not public content; the budget math is correct with a null UTR and
fabricates no verdict; no `undefined` reaches `classifySchoolFit`; 033's
`encouragement_notes` policy is sound; 034's JWT-role fix is correct; and no
client-writable table is missing a trigger — it reached the same conclusion
I did about `parent_accounts`, `badges` and `friendships`, independently.

**This is the second night running that an independent pass found a Critical
in work I had already tested and written up as done. The review step is
paying for itself every time.**

## TASK F — self-check and a second verifier: **DONE, and it found another Critical**

A second fresh agent verified the fixes from TASK E. It found **a Critical I
introduced while fixing the previous Critical** — the third night running
that a fix has carried a new one.

### Critical — the `0` sentinel violates a live CHECK constraint

`profiles_current_utr_check` (migration **006**, applied and live on
production **now**) is:

```sql
check (current_utr is null or current_utr between 1 and 16.5)
```

So the sentinel I introduced to stop the coach email claiming a UTR —
`currentUTR: 0` — goes straight into `writeCurrentPlayerProfile`'s upsert and
raises **23514**. Reproduced on staging:

```
ERROR 23514: new row for relation "profiles" violates check constraint
"profiles_current_utr_check"
```

Every profile write would have failed for any user with no UTR: a parent
finishing signup and then editing anything, a player starring a school,
saving weaknesses, requesting deletion. The old placeholder of 7 satisfied
the constraint, so this was **new breakage introduced by the fix**.

`utr_entries_utr_check` is `utr between 1 and 16.5` with **no NULL escape**,
and `completeOnboarding` wrote `utr: finalized.currentUTR` with no `.catch` —
so a player finishing onboarding without a rating hit 23514 as an unhandled
rejection. Silent, on the path that creates an account.

**Fixed:** `current_utr: player.currentUTR > 0 ? player.currentUTR : null`.
0 in memory, NULL in the database, and the two round-trip. The onboarding
entry is skipped when there is no rating, and both onboarding writes now
have `.catch`. `lib/utr-sentinel.test.ts` transcribes the live predicate and
fails if the sentinel can reach Postgres again.

### High — the sentinel was leaking into six more screens

The verifier's point was sharper than the bug list: *"fixed at the source,
not the pixel" was correctly diagnosed, then repeated.* I had fixed display
sites and the email, and left the arithmetic.

- **`/events`** rendered the literal string **"Fit checked against UTR
  0.00"**, unconditionally, above the empty state — the first thing a new
  user sees on that page. The same 0 drove `evaluateTournamentFit`, which
  clamps to 1 and then states the invented rating in prose: *"At UTR 1.0
  this level's typical field would be a big step up."*
- **`RangeBar`'s tooltip** still printed **"You 0.0 · Gap to median −12.1"**
  — in the component I had edited. I made `youPct` nullable and hid the dot,
  and left `you` and the tooltip. Two of its three callers were never
  touched, so the dot sat at 0% on **all 68 school rows** and on `/plan`.
- **`/plan`** produced four confident wrong answers from 0: a required pace
  of **7.1/year**, a roadmap checkpoint of 5.5, a chart point at UTR 0, and
  a "closest schools" list that was simply the five lowest-rated programs in
  the catalog.
- **The legacy design** — which ships and is reachable from the footer and
  Settings → Appearance — showed a 6xl **"0.0"** under "Your current UTR"
  with "+8.4 to reach your goal", a plan named **"0.0 UTR build week"**,
  training hours computed from `0 + 2`, and every logged opponent counted as
  "above your level".
- **`parent-dashboard-view`** still used the parent's own graduation year,
  target-school count, country and tournament counters as the player's.
  **My claim that "all four views use `resolveFamilyPlayerFacts()`" was
  false** — I had converted one line in that file and left the `??` on the
  next.

All fixed, each with the unknown case rendering an honest state rather than
a number.

### High — three rate-limit buckets were never counted

034 switched every route to `peek_rate_limit`, which only reads. That is
correct for a bucket whose table carries the trigger. It is wrong for
`account_deletion`, `data_export` and `whop_checkout`, which describe an
action and have no table behind them — so nothing ever incremented their
counter. **`/api/account/export`, a full JSON dump of everything stored
about a person, had no rate limit at all** while the policy still declared
3/hour.

Fixed: those three consume, the rest peek, and a test asserts the partition
is **total** — a bucket counted by neither now fails the build.

### Medium — two more ways past my SEO guard, and 035 breaking its own rule

The verifier built a gate behind a **relative import** (`./inner`) and one in
a **`template.tsx`**, and all ten of my tests passed. Both are closed —
relative specifiers are resolved now, and the wrapper chain walks real
directories (so route groups are included) collecting `layout.tsx` *and*
`template.tsx`. I replanted both cases to confirm they fail.

035's header argued at length that inline subqueries in that trigger are
RLS-filtered and unsafe — and then did an inline `SELECT INTO` forty lines
later, which sets its targets to NULL silently when no row matches. Routing
it through a SECURITY DEFINER helper failed for a different reason: the
trigger runs as `authenticated`, so the helper would have to be executable by
every signed-in user — a consent-status oracle for any uuid. **The read is
removed entirely.** `DO UPDATE SET` only assigns payload columns, consent is
not one, and the UPDATE branch forces it from `old` regardless. The shortest
correct code was none.

### What the verifier confirmed

All nine legacy contrast fixes, re-measured independently (4.62–5.57:1, none
under 4.5). All five new/changed test blocks, mutation-tested. All four
previously-claimed SEO closures, replanted. The pricing derivation is
byte-identical to the hand-typed sentence. `setToast` is sound with no stale
closure. **035's trigger loses no protection** — the UPDATE branch is
byte-identical to 033's. No division by UTR anywhere. `getSchools()` = 68.

### Verification after all of it

`rm -rf .next && tsc && lint && vitest && build` — tsc clean, lint clean,
**624 tests**, production build passes. axe still **0** across 10 pages × 2
viewports, no blank screens, no raw error text. All seven staging acceptance
checks re-run against the final trigger and passing.

One self-inflicted build break along the way, caught by the build: my
import-insertion script put an import above a `"use client"` directive.
Fixed, and I checked every other touched file for the same thing.

---

## Final state at the end of Night 2

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next lint` | clean |
| `npx vitest run` | **624 tests, 48 files, all passing** |
| `npx next build` | passes, **twice in a row** |
| axe across 10 pages × 2 viewports | **0 violations** |
| Lighthouse mobile | accessibility **100**, SEO **100** on every scoreable page |
| Working tree | clean, everything pushed to `v1` |
| Supabase security advisors (staging) | 3 categories, all expected and documented — see below |

**Advisors, unchanged in kind from before the night's work:**
- `rls_enabled_no_policy` ×4 — `badges`, `friendships`, `family_join_attempts`,
  `rate_limit_events`. All four are deliberately locked: RLS on with no
  policies denies every write.
- `authenticated_security_definer_function_executable` ×20 — these are the
  product's RPC API. CLAUDE.md records why the EXECUTE grant cannot simply be
  revoked: Postgres checks the privilege against whoever runs the query, so
  revoking it fails any policy that uses the function **closed**. The count
  rose 19 → 20 with `profile_row_exists`, which returns only a boolean and is
  needed by a SECURITY INVOKER trigger.
- `auth_leaked_password_protection` ×1 — Pro-only, deferred by Niran.

**Production was never touched.** Its only use tonight was read-only
introspection: `list_migrations`, `pg_policies`, `pg_get_functiondef`,
`information_schema`, and one read of a migration's recorded statements.
`main` is still `d059006`, serving the maintenance 503.

**Staging** is in the full post-rollout state with all fourteen migrations
applied, the rehearsal fixtures left in place as seed data, and every
acceptance check passing.

---

## The one thing to take from this run

Three Criticals tonight and last night. **All three were introduced by a fix,
not found in old code**, and **none was caught by my own testing** — each
needed an independent pass:

| Found by | What it was | Introduced by |
|---|---|---|
| Night 1 reviewer | family takeover via profile INSERT | the original design |
| Night 2 reviewer | 032/033 break every profile write | **the fix for the above** |
| Night 2 verifier | the `0` sentinel violates a live CHECK | **the fix for the above** |

Each time I had tested the path I was thinking about and assumed the rest.
Each time the write-up said "done" before it was. The review step is not a
formality on this project — it is the only control that has caught any of
these, and it has now caught one every single time it has run.

**If only one habit survives from tonight: after fixing something, test the
path you were NOT thinking about.** In all three cases that was an ordinary
user doing an ordinary thing — renaming themselves, deleting their account,
signing up without a UTR.

---

# MORNING RUN (2026-11-15, after Niran's "fix it" on the family gap)

## TASK A — final dress rehearsal on staging: **DONE, all green**

Niran's decision on the one open judgement call was to fix the joined-member
read gap. That became migration **036** (`0ec2473`), and this rehearsal ran
the whole plan again from production's shape with 036 in it.

### A1. Backward sweep to production's 23-migration shape

Every documented rollback from §J step 13 down to step 2 was executed in
reverse order. Then checked against production, read-only:

| Pre-flight | Result |
|---|---|
| Production still has exactly 23 migrations | ✅ 23 — the plan is not stale |
| Tables, both sides | ✅ 23 vs 23 |
| Columns | staging 231, production 223 — **8 extra, all accounted for** |

The 8 are exactly the additive columns the rollbacks deliberately leave
behind: `parent_accounts.{status, approved_at, approved_by, reminded_at}`
(023 + 026) and `profiles.{birth_year, consent_status, consent_granted_at,
consent_granted_by}` (030). This is §J's own "these rollbacks restore
BEHAVIOUR, not SCHEMA" — now enumerated rather than asserted.

### A2. Three more defects in the rollback half, found by running it

Last night's rehearsal found four. This one found **three more**, and one of
them would have caused a second outage *during* an incident.

| # | Defect | Severity |
|---|---|---|
| 5 | **Step 12's rollback dropped `profile_row_exists()`, which step 10's rollback calls.** Running them in the documented reverse order (12, then 10) left every profile write in the app raising `42883 function public.profile_row_exists(uuid) does not exist`. Reproduced on staging with exactly the upsert `writeCurrentPlayerProfile()` issues. Fixed: step 12 now says, in capitals, to leave the function in place, and explains why. | **High** — the rollback breaks the app worse than the thing it is rolling back |
| 6 | **Step 12's rollback was prose, not SQL** — "then restore 032's trigger body and 034's enforce_write_rate_limit() and delete_my_account() from those files". Not pasteable at 3am. Fixed: it now names the three files to re-run, in order, and records that all three are idempotent (verified statement by statement). | Medium — same defect class that was fixed in four other steps |
| 7 | **Step 9's rollback was prose too** — "Restore 030's version of the trigger function verbatim". Fixed: 030's trigger body is now written out in full, with a note that it restores the 23502/42501 upsert bug 035 exists to fix, so it is only a waypoint. | Medium |

### A3. Forward sweep — all fifteen, in §J order, with every pre-flight

`025 → 022 → 023 → 026 → 024 → 027 → 028 → 029 → 030 → 031 → 032 → 033 →
034 → 035 → 036`, applied from the repo files.

| Step | Pre-flight / verify | Result |
|---|---|---|
| 2 (022) | trigger present | ✅ |
| 3 (023+026) | 4 pre-existing links backfilled to `approved`, zero `pending`, count unchanged; `families` locked; self-insert policy gone; rate-limit table created | ✅ 4 / 4 / 0 |
| 4 (024) | zero free accounts over the 3-target limit; outreach write now `has_tier('player')` | ✅ 0 |
| 5 (027) | rows with `privacy_level='public'` | ✅ 1, the one known row |
| 6 (028) | `data_export` allows 3, denies the 4th with `retry_after_seconds`; unknown bucket fails closed | ✅ 3 then denied, 3600, `unknown_bucket` |
| 7 (029) | profiles owed a manual deletion | ✅ 0 |
| **8 (030+031)** | **mandatory: every row `not_required`, zero `pending`** | ✅ **12 / 12 / 0** — nobody locked out |
| 8 | gate landed on 21 tables; restored `family_members()` has no PUBLIC/`anon` grant | ✅ 21; `postgres=X, authenticated=X, service_role=X` |
| 9 (032) | takeover INSERT raises 42501 | ✅ |
| 10 (033) | sibling player writing a "parent" note refused; profile INSERT with no `birth_year` refused | ✅ 42501 / 23502 |
| 11 (034) | exactly 20 direct `utr_entries` writes allowed, 21st refused | ✅ **20, then 53400** |
| 12 (035) | rename via upsert succeeds, consent preserved; `delete_my_account()` deletes everywhere | ✅ 200; profile + UTR + rate-limit rows + auth user all 0 |
| 13 (036) | parent reads the joined player; other family sees nothing | ✅ 2 profiles / UTR 7.90 / 3 rows; 1 / 0 / 0 |

**Then: do the 27 live function bodies match the repo?** Yes — all 27, byte
for byte with comments and whitespace normalised, 0 differences. Worth
stating because the recorded migration *statement text* did NOT match (only
1 of 7 hashes), since I reflowed comments when inlining the files. The
textual difference is real and the semantic one is nil; the check that
matters is the function bodies, and it is clean.

### A4. The three rollbacks Niran named, re-proved individually

| Rollback | Proof |
|---|---|
| **Step 8 (030+031)** | Both halves. Without the `drop function` first, `create or replace` raises **42P13** (031 widened the return type 8→9 columns) — this is the defect that meant the highest-risk step's rollback *could never run*. With the drop, clean: 8 OUT columns, and the ACL carries no PUBLIC and no `anon`. |
| **Step 9 (032)** | The newly written-out SQL runs, and the hole genuinely reopens: with 032 rolled back, a second row successfully claims `FAKEFAMILY01` from an account that was refused 42501 moments before. Rolled back, so the forward state survived. |
| **Step 12 (035)** | 029's `delete_my_account()` restored → deletion fails again with exactly the documented **23503** on `rate_limit_events_user_id_fkey`. `profile_row_exists()` left in place, so nothing else broke. Forward state restored afterwards. |
| **Step 13 (036)**, extra | Runs clean; the pre-036 behaviour returns exactly (parent back to 1 profile, 0 UTR rows); and dropping the predicate before its seven policies raises **2BP01**, so the documented ordering is load-bearing. Rows written while 036 was live keep their correct stamp — nothing to undo. |

### A5. Ordinary-user checks, on the real v1 preview reading staging

Preview `0ec2473`. Confirmed first by grepping the deployed client chunks:
**staging ref present, production ref absent** (0 of 24 files). Every check
below went through the deployed app's own endpoints with a real signed-in
JWT — Supabase Auth for the session, then the app's API routes and
PostgREST, which is what the browser client uses.

| Check | Result |
|---|---|
| Sign up without a UTR | ✅ 201. `current_utr` is **NULL**, not the 0 sentinel; `consent_status` derived to `not_required` |
| Rename yourself in Settings | ✅ `POST /api/profile` → **200 `{"ok":true}`**, sent with `currentUTR: 0` — the exact payload that raised 23514 before 035. Name changed, UTR still NULL |
| Export data | ✅ `GET /api/account/export` → **200**, 18 tables, with `exported_at` / `account_id` / `about` / `data` |
| Family join + approve + parent reads player | ✅ **0 profiles and 0 UTR rows before approval; profile + all 3 UTR rows (6.1, 6.4, 6.8) + the match after.** This is 036's whole purpose, in the parent-first flow, end to end |
| Under-13 consent | ✅ Inert: own profile only, 0 UTR rows, writes **403**. Parent approves → `consent: granted` in the same action; `my_consent_state` → `granted` |
| Delete your account | ✅ `deleted`, `family_deleted: true`; profile, auth user, family, family_code and rate-limit rows all **0**; the token reads nothing afterwards |
| Pricing → checkout starts | ⚠️ **Not verifiable on Preview, by design.** `WHOP_API_KEY` is a Production-only variable, so `getWhop()` is null and the route refuses cleanly with 500 "Billing isn't configured yet." before it ever reaches a plan ID. Must be checked live — it is on the TASK C list |

**One thing the stamp test taught — and the claim I got wrong here.** The
joiner's match written *before* approval is stamped `family_code = NULL`
(correct — a pending member is not in a family), and the one written *after*
carries `RPPARENTAAAA`. RLS lets the parent read both, because 036's read
policy keys off the owner's current membership rather than the row's stamp.

I then wrote that this meant such rows were safe, and that was wrong. **The
app never asked for them.** `loadMatches`, `loadTournamentEntries`,
`loadCoachOutreach`, `loadDailyCheckins` and `loadCostCalculations` still
filtered the parent's view with `.eq("family_code", code)` — 036 changed only
where that code came from, not the filter — and the stamp trigger freezes the
column on UPDATE, so a NULL can never heal. So every row a player wrote while
waiting for approval would have been permanently invisible on the family
page, and I had verified RLS and assumed the rest. An independent review
found it an hour later. Fixed: those five queries now filter
`.in("user_id", approvedFamilyMemberIds())`, which is what the policy keys
off. The design argument was right; the evidence I gave for it was not.

### A6. Two findings that are not mine to fix

1. **Supabase Auth email confirmation + the built-in SMTP quota.** A real
   signup through the deployed preview returned
   **`429 over_email_send_rate_limit`**, which means (a) "Confirm email" is
   ON on staging and (b) the project's built-in email quota is small and was
   exhausted by two attempts. The app handles the confirmation case correctly
   (`signUp` returns `confirmationRequired` and defers the profile write), so
   this is not a code bug — but **if production is configured the same way,
   signups will start failing with a 429 after the first couple per hour.**
   I could not read production's setting: it is a dashboard value, and the
   data is ambiguous (10 users, all confirmed, but only 2 confirmation emails
   ever sent). **Niran must check Authentication → Sign In / Providers →
   "Confirm email" on production, and either turn it off or configure custom
   SMTP, before announcing.** Launching is still strictly better than the
   current 503, and the symptom is instantly diagnosable, which is why this
   is a check and not a block.
2. **Supabase Auth rejects the `.example` TLD.** `*@test.example` addresses
   cannot be created through the real signup flow — staging's existing
   fixtures with those addresses were inserted straight into `auth.users`,
   which is why they look fine. Use `@example.com` when reseeding.

### A7. What staging holds now

The full post-rollout state, all fifteen migrations, plus clearly-fake
fixtures: `FAKEFAMILY01` (creator-parent + joined player), `FAKEFAMILY02`,
`TESTFAMILYA`, `STAGINGDEMO1`, `RPPARENTAAAA` (the rehearsal's parent-first
family with an approved player and an approved under-13 with consent
granted), and `attacker-insert@test.example` — an auth user with no profile,
kept deliberately because testing a profile INSERT needs one.
`stranger@test.example` and `fake-rp-player@example.com` were consumed by the
deletion tests; that was the test.

Advisors: 3 categories, all expected — 4 × `rls_enabled_no_policy` on
deliberately locked tables, 21 × `authenticated_security_definer_function_executable`
(the RPC API; up one, for 036's `shares_approved_family_with`), 1 ×
leaked-password protection (Pro-plan, deferred). No new kinds.

## TASK A, continued — the independent verifier: **three HIGHs in my own work**

A fresh agent with no context reviewed `0ec2473` + `3571598` adversarially.
It could not break 036 with a stranger, a pending member, another family, a
removed member (post-023 shape), an unconsented under-13 or `anon` — and it
confirmed the stamp trigger, the upsert paths, the solo-player-with-no-family
case and `delete_my_account()` all behave. **Then it found three real defects,
two of which made a sentence this work shipped untrue.** Fixed in migration
**037** and the commit alongside it.

### 1. Removal did not revoke — in production's exact data shape

036's header argues against setting a joiner's `profiles.family_code` because
`remove_family_member()` only deletes the `parent_accounts` row, so a member
holding both would keep access. It then shipped this in `/privacy`:

> "the moment a member is removed from a family they can no longer see
> anything about anyone in it"

**All three of production's `parent_accounts` rows belong to users whose own
`profiles.family_code` is the same code** — the pre-023 shape, from when the
app wrote both. I verified that read-only on production and reproduced the
consequence on staging: after removal the member still read 2 profiles and 3
`utr_entries` rows, `my_family_code()` still resolved, and `family_members()`
still listed them as an approved creator.

I wrote the sentence and I wrote the paragraph explaining why the mechanism it
denies exists. Both in the same file.

**Fixed:** 037 clears the profile column on removal, but only when somebody
else still holds that code — so the account holder cannot be evicted and a
family is never orphaned. Both production families satisfy that
(`NIRAN-0FI8` 4 holders to 2 links, `NIRAN-0LK2` 2 to 1). Verified both
directions: the removed member drops to 1 profile / 0 UTR / 0 roster / NULL
family code, and the parent's roster drops to 2 with 0 of the removed
member's rows.

### 2. The family read was the whole row — the shape 027 existed to close

RLS cannot narrow **columns**, and `authenticated` holds column-level SELECT
on every `profiles` column. So any policy letting one member read another's
row exposed email, gpa, birth_year, `whop_membership_id`, both stripe ids,
`utr_profile_link`, `privacy_level`, `username`, `home_area`. 027's own
write-up calls that row shape the hole it closed — it closed it for
strangers and left it inside the family, and 036 widened the family case from
one flow to both, and to sibling-to-sibling.

This is live on production right now, before any of my work: family
`NIRAN-0FI8` has **four** profiles holding the same code, so four accounts
can read each other's complete rows.

**Fixed:** 037 drops `family_members_read` and moves the roster into
`family_members()`, which now returns an enumerated 15-column list. A family
member sees name, email, role, status, creator flag, joined/reminded, consent
status, current UTR, grade, graduation year, onboarded, target schools,
gender — and **not** gpa, birth_year, billing ids, utr_profile_link,
privacy_level, username or home_area. Verified: an approved parent now reads
**1** `profiles` row (their own, 0 cross-user), gets a 3-row roster, and
still reads the joined player's 3 UTR rows and 2 matches. **Net effect is
narrower than before 036 and narrower than before this whole piece of work.**

### 3. Rows written while PENDING were invisible in the app

Covered above, in §A5's correction. My claim there was wrong and the review
was right.

### The smaller ones, all fixed

| # | What | Fix |
|---|---|---|
| 4 | `DECISIONS.md`'s "why no backfill" had the logic **backwards** — the policies key off current membership and ignore the stamp, so 036 *does* widen reads of pre-existing rows, retroactively | Rewritten to say the widening is deliberate and reaches backwards, which is the part a parent would notice |
| 5 | `family-scope.test.ts` was "mutation-tested" and "fails on any reintroduction" in CLAUDE.md. **It was neither.** The detector keyed on four hard-coded receiver names, and its comment-stripper deleted from any `//` — including inside a string, so a line with a URL was invisible. The review defeated it **eight** ways | Rewritten with a string-aware comment stripper, any-receiver matching, destructuring and `["family_code"]` forms; all eight defeats are now test cases; mutation-tested against the real repo in two shapes, each naming the file. A second invariant added: no cross-user `profiles` read |
| 6 | Stale numbers inside the same commit: "four rollback defects" (seven), the verification crib's "1 profile row; without it, 12", and — worst — CLAUDE.md still shouting that **`.env.local` points at PRODUCTION** when it points at staging | All corrected. I re-ran the greps myself: 1 staging ref, **0** production refs, no service-role key, and `.env.local.prod-backup` is covered by `.gitignore`'s `.env*` rule with no env file tracked |
| 7 | "all 27 live function bodies match the repo" undercounts the comparable set (30 repo-defined functions are live) | The 27 that matched are the 27 I compared; the claim is now scoped to that rather than phrased as complete |
| 8 | MASTER_ROADMAP said "nine build-failing guards" and listed seven. I then replaced it with "eleven" and listed **thirteen** — the same mistake, in the fix | Counted by listing the files. Thirteen, enumerated |
| 9 | "the rollback restores the pre-036 behaviour **exactly**" | It does not: rows stamped during the 036 window stay family-readable afterwards. Reworded, and §J step 13 already said so |
| 10 | Two new silent-empty paths (`approvedFamilyMemberIds()` returns `[]` on RPC error) | Left as-is and recorded: fail-closed, and an empty family page is the right failure for a transient RPC error. Noted in `docs/TODO.md` |

### And one defect the verifier did not find, because I found it first

**§J step 15's "revert the maintenance commit" could not work.** `d059006` is
not an ancestor of `v1` and `middleware.ts` has never existed there, so
`git revert d059006` has nothing to delete — and the plain merge is **clean
and keeps the file**. I dry-ran the real merge in a throwaway worktree:
Vercel would have reported READY and seededtennis.com would still answer 503.
The last step of the rollout, failing silently. Step 15 now carries the
sequence that works (merge `main` into `v1`, delete the file there, confirm in
a scratch worktree before opening the PR), each line verified.

### Not covered by the verifier, stated so it is not mistaken for verified

- §J step 12's rollback was **inspected, not executed** by the verifier. I
  did execute it (§A4) and it produced the documented 23503.
- Nothing was tested through the deployed Preview app by the verifier — §A5's
  Preview results are mine alone.
- Billing/Whop untouched by both of us.
