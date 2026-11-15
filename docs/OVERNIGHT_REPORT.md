# Overnight run — 2026-11-14/15

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

---

## 1. WHAT NIRAN DOES BY HAND

### 🔴 Blocks launch

**a. Point `.env.local` at staging.** Local dev currently reads and writes
**production**. Replace these two lines in `.env.local` (both values are
public — they ship in the client bundle):

```
NEXT_PUBLIC_SUPABASE_URL=https://gnlcpnsweqbtwpaqhqqg.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the staging publishable key from Vercel Preview>
```

Also blank or replace `SUPABASE_SERVICE_ROLE_KEY` in that file — leaving
production's there while the browser talks to staging is worse than either
alone, because server routes would write to production while the UI shows
staging. **Until this is done, nobody should sign in locally.**

**b. `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` in Vercel → Production.** Without
it the Google button does not render. Set it **last**, after (c) — with the
flag on and the provider off, the button appears and Supabase refuses.

**c. Enable the Google provider in Supabase → Authentication → Providers →
Google.** Add the client ID and secret from the Google console, and add the
redirect URL **`https://seededtennis.com/auth/callback`** to Supabase's
allowlist *and* to the Google console's "Authorised redirect URIs".

**d. Google OAuth consent screen** needs a privacy policy URL and a terms
URL. They now exist: `https://seededtennis.com/privacy` and
`https://seededtennis.com/terms`.

**e. `support@seededtennis.com` must exist and be monitored.** The privacy
policy tells parents to use it for requests about their child. A published
address that bounces is worse than no address.

### 🟡 Before the first paying customer

**f. Have a lawyer read `/privacy` and `/terms`.** Seven specific questions
in `docs/TODO.md`, headed by the one that could change the product: whether
our consent mechanism satisfies COPPA's *verifiable* parental consent. It may
not.

**g. Decide on CAPTCHA** for signup and password reset (backlog item in
`docs/TODO.md`). Leaked-password protection stays deferred per your call.

### ⚪ Informational

**h.** The 4 new Whop plan IDs are in Vercel for Production + Preview +
Development — confirmed. The 2 legacy IDs are Production-only; that is fine
(no checkout ever sells them) but add them to Preview if you want the
post-checkout sync to find legacy memberships on a preview build.

---

## 2. WHAT CLAUDE RUNS AFTER "GO"

Nothing below has been started. Full detail and per-step rollback in
`docs/HANDOFF.md` §J and §K.

**Step 0 — Backup.** Supabase → Database → Backups, note the timestamp.
*Rollback: this IS the rollback for everything that follows.*

**Steps 1–8 — Migrations, in this exact order**, verifying after each:

| # | Migration(s) | Pre-flight that must not be skipped | Rollback |
|---|---|---|---|
| 1 | `025` | expect a no-op on prod | nothing to undo |
| 2 | `022` | `git show main:lib/auth.ts` writes no locked column | `drop trigger profiles_protect_privileged` |
| 3 | `023` + `026` | every existing `parent_accounts` row backfills to `approved` | restore policies, never drop columns |
| 4 | `024` | count Free accounts already holding >3 targets | drop trigger + restore old policy |
| 5 | `027` | 1 production row is `privacy_level='public'` — that person loses nothing they use | recreate the policy |
| 6 | `028` | additive | drop function + table |
| 7 | `029` | **0 rows have `deletion_requested_at`** (checked read-only — nobody is owed a manual deletion) | drop function; a completed deletion is not reversible |
| 8 | `030` + `031` | **🔴 the one that matters: `select consent_status, count(*) from profiles group by 1` must be every row `not_required`, zero `pending`.** One `pending` row means a locked-out account — stop and roll back. | drop the 21 restrictive policies first, sort the rest after |

**Step 9 — The code.** PR `v1` → `main` **including `git revert d059006`**
(the maintenance middleware), wait for `verify` to pass, merge. Never bypass
the ruleset. *Rollback: Vercel → promote the previous production deployment,
then run 024's rollback SQL.*

**Step 10 — Live checks on seededtennis.com:** 200 not 503, signup, login,
Google login, onboarding, under-13 consent, family join + approve, fit
report, outreach gating, pricing toggle.

**Step 11 — Whop.** Send a test `membership.activated` from the dashboard,
expect **200**. Then replay the missed events. ⚠️ **The webhook is reachable
only after step 9** — the maintenance middleware 503s it, which is why your
earlier test delivery got a 503. If replay does not reconcile
`mem_xZKHm92QxEIqsS` (your bullis.org Player membership, metadata intact), I
set `subscription_tier='player'` and `whop_membership_id='mem_xZKHm92QxEIqsS'`
on that profile with the service role.

**Step 12 — The $0 purchase**, walked through together. Full script in
`docs/HANDOFF.md` §K: 100%-off promo on `plan_iWNSNKqks0ddp`, confirm $12 →
$0, complete it, then check the tier in the database, the webhook delivery,
and that `/outreach` unlocks.

---

## 3. OPEN ITEMS, SORTED

**Blocks launch**
- `.env.local` → staging (above)
- Google provider + flag + redirect URLs (above)
- `support@seededtennis.com` live (above)
- The production rollout itself (§J)

**Week 1**
- Lawyer review of `/privacy` and `/terms`
- Reconcile the bullis.org membership if replay misses it
- `next@16` upgrade — clears the last critical + high in production deps,
  both currently unreachable (no `remotePatterns`, zero `next/image`,
  Vercel-hosted; postcss is build-time only)
- Browser-path E2E for signup/OAuth/checkout/export once local dev is safe
- CAPTCHA decision

**Later**
- Nonce-based CSP (drops `'unsafe-inline'`; needs middleware)
- P1-DATA-1 real roster import — still the highest-value product work
- P1-UX-2 delete Legacy · P1-UX-1 theme flips · P1-FIT-3 noisy projections
- Error tracking: still 1/10, and the billing outage is what that looks like
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

## TASK 5 — Independent security review: *running in a separate agent*
