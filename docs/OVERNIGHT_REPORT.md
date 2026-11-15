# Overnight run — 2026-11-14/15

> Live log. Updated after every task. Read this plus `git log` before
> resuming anything.

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

## TASK 3 — Fit report trajectory: *in progress*
