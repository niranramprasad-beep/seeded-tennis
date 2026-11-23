# Seeded — TODO

**The one list of open work.** [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md)
orders it (status, blockers, NEXT 10); this file holds every open item with
its reasoning. Done or overtaken items move — verbatim, never deleted — to
[`archive/TODO_DONE.md`](archive/TODO_DONE.md).

Reorganised 2026-11-22 (`chore/docs-organize`): grouped by area, done items
moved out. Every item below keeps the wording and date it was written with,
so "tonight", "Week 1" or "before launch" inside one means *as of that
date*. A status line is a claim about a live system: check `pg_policies`,
`list_migrations` or the code before relying on it.

How to use it: add a new item under its area with the date and where it was
found; when you close one, move it to `archive/TODO_DONE.md` (newest move
first, with why) in the same commit as the fix.

1. [Owner (Niran) — dashboards, keys and decisions](#1-owner-niran--dashboards-keys-and-decisions)
2. [Security and database](#2-security-and-database)
3. [Billing and checkout](#3-billing-and-checkout)
4. [Product and UX](#4-product-and-ux)
5. [Catalog and data](#5-catalog-and-data)
6. [Performance and SEO](#6-performance-and-seo)
7. [Code health, tests and dependencies](#7-code-health-tests-and-dependencies)

---

## 1. Owner (Niran) — dashboards, keys and decisions

Not code. Copied from the 2026-11-21 NEXT 10 (kept in
`archive/ROADMAP_HISTORY.md`):

Niran's own list (dashboards/keys, not code): **turn off the Supabase GitHub
integration's deploy to production** (Supabase → production project →
Project Settings → Integrations → GitHub: "Deploy to production" off, or
disconnect; final-check `prF/SUPABASE_CHECK.md`) — never by renaming
migration files; confirm a scheduled Uptime run exists after PR F merges;
**run the $0 production
checkout test** (a 100%-off, one-use promo on Player monthly; steps and the
webhook API-version check in final-check `prE/PROD_CHECKOUT_TEST.md`) —
the only way to prove checkout → webhook → tier on production; revoke the old Gemini and
Stripe keys; Supabase and Vercel Pro before taking real money (Auth rate
limits and leaked-password protection are plan settings); an adult/lawyer
review of the privacy policy (with `docs/legal/proposed-policy-edits.md`);
**GA Admin → Data streams → web stream → Enhanced measurement: turn OFF
entirely** (page changes based on browser history, outbound clicks, site
search, form interactions, file downloads, video), then confirm in DebugView
that a calculator → /onboarding navigation sends no query; pick a GA
retention period. Follow-up (code): the homepage calculator still puts its
answers in the `/onboarding?utr=…&gradYear=…&gender=…` URL — move them out
of the URL (e.g. the sessionStorage hand-off the diagnostic already uses).

Also the owner's:
- **UTR licensing** for the imported ranges (DATA_QUALITY "Second source"),
  and whether to purge the raw roster file from git history (§5 "Catalog
  phase 1 follow-ups", last bullet).
- **Observability:** Vercel log drain vs Sentry (MASTER_ROADMAP NEXT 10 #10).
- **Production's 28 generated workout sessions** (5 training_plans, 3 users)
  are hidden by PR C, not deleted. **Decided 2026-11-19: keep them hidden; do
  not delete. Revisit on or after 2026-12-19** (30 days): if nobody has asked
  for them, propose deletion again with a backup.

### Billing — before launch

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
- [ ] Replay the missed `membership.activated` events, or reconcile the two
      existing customers by hand.
- [ ] Run the $0 promo-code end-to-end test (§K) on staging.
- [ ] **Supabase SMTP (Resend).** Niran is wiring this 2026-11-15. A real
      signup against the preview returned `429 over_email_send_rate_limit`:
      the built-in sender allows a few messages an hour, so with "Confirm
      email" on, launch day's third signup cannot confirm. Re-test one real
      signup end to end once Resend is live.

The Whop dashboard steps, plan IDs and the $0 end-to-end test are written
out in [`HANDOFF.md`](HANDOFF.md) §K.

### What a lawyer has to check before launch (P0-8)

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

6. **P0-8's other half — the privacy policy.** The mechanisms are built and
   tested: real deletion, a complete JSON export, under-13 consent, and
   nothing about a minor visible to any other user. What does not exist is
   the document that explains all of that to a parent, lists the processors
   (Supabase, Vercel, Whop, Google Analytics) and states retention. That
   needs an adult or a lawyer, not Claude. The one-paragraph policy inside
   `/terms` is what is live today.

## 2. Security and database

### Pending under-13s and parents' own player rows (both are migrations; Niran, 2026-11-16)

- **A. An under-13 whose consent is PENDING must see no family names,
  emails or ratings.** Today `family_members()` still returns the roster
  (names, emails, ratings) to a pending under-13 who has joined a family —
  030/031 make their account inert for writes and most reads, but this
  SECURITY DEFINER function is the exception. Fix: have `family_members()`
  return zero rows (or only the caller's own row) while
  `my_consent_state()` is `pending`; rehearse on staging with a pending
  under-13 joiner; guard test on the roster function. See item 10 below,
  which this replaces.
- **B. Parents cannot insert player-data rows under their own account.**
  Role-gate the INSERT policies on utr_entries, matches, tournament_entries,
  coach_outreach, daily_checkins and the other player tables
  (`profiles.role = 'player'` in WITH CHECK, mirroring 033).
  (`is_parent_member()` became role-aware in 050, 2026-11-20.) Today the app's routes refuse it (403),
  but PostgREST allows it. Same item as 3 below, promoted.

### Family plan (045) and parent email proof (043) follow-ups

- **045 follow-ups (review 2026-11-19, LOW, not fixed):** (1) the
  confirmation-required sign-in path (`lib/auth.ts`, `ensureSupabaseProfile`
  on first login) ignores `joinStatus`, so a `family_full` or
  `verify_email_required` there says nothing — production auto-confirms, so it
  is rarely reached; (2) a joiner who was already PENDING when the family
  filled up gets no message — only the approver sees `family_full`; (3) support
  has no way to raise one family's cap short of a migration, and an under-13
  refused by a full family can only reach consent through support.
- **Live magic-link check for 043** (HANDOFF §J Step 18): needs a real inbox on
  staging, and `<site>/auth/verified` added to Supabase Auth → URL
  Configuration → Redirect URLs on staging and production BEFORE 043 ships.
- **Email budget:** every parent who wants to approve or consent will need one
  verification email; production's custom SMTP allows 80/hour for the whole
  project, shared with password resets. Supabase Auth's own rate limits are the
  only real cap on `signInWithOtp` (the `email_verify` bucket limits Seeded's
  own path only).

### Still open after the rollout

- **An EMPTY family's code can be claimed by a new signup** (found on
  production 2026-11-16, step 9). 032 blocks a code that any profile or
  `parent_accounts` row holds; production has one `families` row with 0
  holders and 0 links, and a profile INSERT with that code succeeds. It
  exposes nothing — there is no one in it to read — so it is LOW. Fix:
  delete member-less `families` rows (service role, by hand), or have
  `family_code_is_taken()` also check `families`.

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
12. **Nonce-based CSP** — drops `'unsafe-inline'` from `script-src`. Needs
    a middleware.ts, which `main` no longer has (the maintenance-page
    middleware was removed 2026-11-16), so it needs a new one (P2).

### Who may approve a parent joiner (found by the 050 review, 2026-11-20)

**052 is ON PRODUCTION since 2026-11-22** (HANDOFF §J Step 27; MASTER_ROADMAP
status). How it was built, and the pre-052 MEDIUM gap it closed, are in
`archive/TODO_DONE.md`. Still open:

**Still open:** ~~(1) production~~ (done 2026-11-22); (2) the "approved by" line in Settings →
Family — `parent_accounts.approved_by` is already written by
`approve_family_join()` (since 023; rows backfilled by 023 have it NULL), so this is UI plus exposing it through
`family_members()` (a roster column, so 038's shape test and /privacy's
column list change too); (3) `deny_family_join()` is unchanged — any
approved member, a player included, may still decline a PENDING parent
request (it grants nothing, but a player could keep turning away a real
parent); (4) the accepted residual risk below has a sharper edge than it
first reads: a fake first parent then becomes the gatekeeper for later
parents, and a player cannot remove it — a real parent has to be approved by
it, or the family has to start over; (5) not caused by 052 but seen in its
probe: a parent whose home is family C and who also joined family A still
counts toward A's 2-parent cap (045's `family_member_count` counts any
approved link), and cannot leave A (`leave_family()` acts on the home family
C). After 052 a player of A can remove them, which frees the slot; (6) the
second accepted edge below (a parent whose home family is elsewhere does not
act for this one) — the "approved by" line in (2) should show each parent's
home family.

**DECIDED by Niran 2026-11-21 — build after the developer review** (DECISIONS
2026-11-21): a player may approve only the FIRST parent of a family; once an
approved parent exists, only an approved parent can approve another parent.
Settings → Family shows who approved whom (needs an `approved_by` on
`parent_accounts`). Accepted residual risk: a player can still create a fake
*first* parent; the "approved by" line makes that visible to the family.
Second accepted edge (052 round-2 review, 2026-11-21): 052 counts only
parents whose HOME family is this one. If a real parent is approved into two
families and the other approval landed first (e.g. a family run by the
player's second account), that parent does not act for this family: a player
here may then approve a fake parent, and may remove the real parent and keep
turning their rejoin requests away. It needs the real parent's own second
join request, so a player cannot cause it alone (probes T1–T5,
`~/seeded-evidence/sat-prereview/p015/round2/`). The "approved by" line
should also show each parent's home family.
Implementation: BUILT as migration 052 (`approve_family_join` and
`remove_family_member`, 033's pattern: the approver's own `profiles.role` +
approved membership) with the guard test; the roster line is still-open item
(2) above.

### Pending-consent accounts could write tennis data onto their own profile (R9 HIGH-1, 2026-11-20) — UPDATE half DONE 2026-11-21

030's own-row carve-out on `profiles` covered every column, so an under-13
waiting for consent could save target schools (the sweep did it through the
UI; the database accepted it). Migration **051** (BEFORE UPDATE trigger)
is ON PRODUCTION since 2026-11-21 03:18 UTC (GO-SEQUENCE row 26, HANDOFF §J
Step 26). **Still open:** the sign-up INSERT is deliberately not covered —
follow-up: have sign-up omit tennis fields for under-13s, then extend 051 to
BEFORE INSERT.
The UI half (no add-target controls for a pending account) ships in PR-SWEEP.

### Still open: `anon` holds column grants on `profiles`

Harmless today and worth closing anyway. `anon` has table-level SELECT on
`profiles` (and the other user tables). It reads nothing, because every
policy is `to authenticated` and RLS denies by default — but that is one
mechanism deep, and 037's whole lesson is that column grants are the layer
RLS cannot reach.

`revoke select on public.profiles from anon;` is probably safe (nothing
pre-auth reads a profile — the pre-auth fit report is pure client-side
computation over the school catalog), but it is an unrequested change to the
auth surface and it belongs in its own commit with its own check that signup
and the signed-out pages still work.

### TRUNCATE is granted to anon/authenticated on the budget tables (pre-existing, LOW)

Found by the same review: `anon` and `authenticated` hold TRUNCATE on
`season_budgets` and `budget_expenses` (Supabase's default grants), and
TRUNCATE ignores RLS. PostgREST cannot issue it, so it is reachable only
from a direct SQL session — the same caveat as S-5 (c). Revoking TRUNCATE
(and REFERENCES/TRIGGER) from anon/authenticated on every public table is a
cheap, low-risk migration; do it with the next one.

### Still open: two silent-empty paths introduced 2026-11-15

Recorded rather than fixed, because both fail CLOSED and an empty family page
is the right failure for a transient RPC error — but the next person should
know they are new.

- `approvedFamilyMemberIds()` / `loadFamilyRosterRows()` return `[]` on any
  `family_members()` RPC error, and `loadFamilyMembers()` then renders the
  "no player has joined yet" state. Before 036/037 the roster came from a
  direct `select`, so a failure surfaced differently.
- `getProfileRoleAndFamily()` ignores a `my_family_code` RPC error, and the
  budget routes turn the resulting `null` into a 403 "You're not part of a
  family yet." That message is wrong for a transient failure.

Both want the same fix: distinguish "no family" from "could not ask", and
show an error state for the second. Small, and worth doing before the first
support email about it.

### "Verify with Google instead" can leave a profile-less auth user (PR D review, 2026-11-21, MEDIUM)

When a parent picks a Google account whose address is NOT their Seeded
address, `signInWithOAuth` signs the browser into a different Supabase user.
If that Google address had no Seeded account, Supabase CREATES one: an
`auth.users` row plus a Google identity (email, name, avatar from Google),
with no `profiles` row. `/auth/verified` signs it out of this browser only
(scope "local") and tells the person, but nothing deletes the row. The same
already happens for anyone who abandons a Google sign-up at `/auth/complete`
(production had 3 auth users without a profile on 2026-11-21).

- **Better fix (Niran's call, a Supabase setting):** enable manual identity
  linking (Authentication → Sign In / Providers → "Allow manual linking") and
  switch the verify button to `supabase.auth.linkIdentity({ provider: "google" })`.
  The Google identity then attaches to the SIGNED-IN user whatever its email,
  no second user is ever created, and 043's check still refuses a different
  address. Downside: a linked different-address Google account becomes a
  sign-in method for that Seeded account, so it needs an "unlink" path too.
- **Cleanup either way:** a scheduled, service-role job (or a documented
  manual query) that deletes `auth.users` rows with no `profiles` row, no
  `parent_accounts` row, older than e.g. 7 days. Count first; never by hand on
  production without Niran's go.

### Database housekeeping

- **Optional: a cleanup migration for stored "legacy" appearance values**
  (PR-LEGACY, 2026-11-20). The Legacy design is deleted, but accounts that
  had picked it still hold `user_settings.notification_preferences.design =
  'legacy'` (and browsers hold localStorage `seeded.design = 'legacy'`). The
  code reads both as "Match system" (`lib/appearance.ts`), never Legacy, so
  nothing is broken. The browser key is removed on the next visit; the
  database key is dropped the next time the account picks Light/Dark/Match
  system (`saveDesignPreference`). A migration could drop every `design` key
  from the bag in one go (`update user_settings set notification_preferences
  = notification_preferences - 'design' where notification_preferences ?
  'design'`) — staging first, then production on Niran's go. Once it has run
  and no browser can still hold the key, `RETIRED_DESIGN_*` and
  `choseRetiredDesign` can go, with their allow-list entries in
  `lib/no-legacy-theme.test.ts`. Not urgent; not a blocker.

- Regenerate `lib/db/database.types.ts` against production after the
  rollout. It is currently hand-maintained against staging: `profiles`
  gained `birth_year` + three consent columns, `parent_accounts` four,
  `family_members()` returns a ninth column, and `rate_limit_events` is new.
- `coach_outreach` still carries 024's superseded `..._insert` / `..._update`
  policies requiring `has_tier('family')` alongside the `..._own` policy
  requiring `player`. Permissive policies OR, so Player tier works — but the
  dead pair reads as a contradiction to the next person.

## 3. Billing and checkout

### Post-checkout sync never runs (found by the PR-LEGACY review, 2026-11-20) — DECIDED 2026-11-21, build after the review

**Niran's decision (2026-11-21):** turn the Whop re-check after a successful
checkout back on, as a backup to the webhook. Requirements: idempotent
(re-running changes nothing once the tier matches), rate-limited (028's
Postgres limiter, like every write route), and it never downgrades (the
anti-downgrade guard in `lib/whop-sync.ts`). Likely shape: forward
`?checkout=success` from `/dashboard` to `/today` (or point Whop's return URL
there) and soften the "Whop doesn't show a membership yet" banner for the
seconds before the webhook lands. Background as found:

Whop's checkout returns to `/dashboard?checkout=success`. Since the redesign,
`/dashboard` redirected to `/today` WITHOUT the query, so `CheckoutSync`
(mounted on every route) never saw `checkout=success` and never called
`/api/whop/sync`. Tier changes rely on the webhook alone. PR-LEGACY keeps
that behaviour on purpose (`app/dashboard/page.tsx`). Keeping the query would
start a live sync call on every purchase and show "Whop doesn't show a
membership for this account yet…" when the webhook is slower than the
redirect. Decide: keep webhook-only, or forward the query (and soften the
banner), or point Whop's return URL at `/today?checkout=success`.

### Left open by the PR E (billing) review, 2026-11-21 — both LOW

- **L3: the body-reader detector in `lib/api-body.test.ts` is a lint, not a
  proof.** It finds `.json()` on a handler's own parameter, `JSON.parse` of
  its `.text()`, and arrow-function handlers. It does not follow the request
  into a helper (`readBody(req)`), an aliased parameter (`const r = req`),
  `formData()`, or `req.body` streams. A route written that way is not
  exercised by the garbage-body behaviour test. Today no route does.
- **L4: a Free PARENT in a family someone else unlocked can still buy
  Player.** /pricing withholds only a second Family plan
  (`lib/plan-entry.ts`); "Choose Player" stays live for every Free viewer,
  because a Family plan does not raise anyone else's own tier (040's cap is
  `has_tier` on the caller's row), so for a player it is a real purchase.
  For a parent, Player buys nothing they would use. Decide whether a parent
  account should be offered Player at all.

### Checkout on an HTTPS preview

8. **Verify checkout on the HTTPS preview.** Locally Whop rejects an
   `http://localhost` return URL, so the four checkout starts could only be
   checked to the request. `/api/whop/checkout` now pins the return URL to
   the production domain or the preview's own `https://$VERCEL_URL`.

## 4. Product and UX

### Design polish round 2 (open from round 1, 2026-11-22)

Round 1 (`herdy-work`, PR #37) is merged; round 2 (`herdy-work` again,
2026-11-22 evening) does the rest: the remaining copy cuts, static pills on
`Pill`, the family page polish, the signed-in sample-report CTA and CSS-only
section motion. Signup field order shipped in PR #39.
Still open:
- **A signed-in visual check on staging** (light/dark, 1440/390). Round 2
  was checked only on the public pages and the `/dev` previews, with
  placeholder Supabase values.
- **Interactive chips** (filters, toggles, result chips, the division chip
  on the checklist, the dashed `DataNote` chip) were left as they are on
  purpose; they are not status pills.
- `bandPositionLabel` (lib/school-fit.ts) and `schoolPageUtrRow().chipSuffix`
  have no screen caller since the school page dropped its band-position
  chip; only tests read them. Delete with their tests, or keep on purpose.
- Sidebar footer now reads "Billing" (was "Parent · Billing", mockup 18).
  Niran to confirm.

### Consult follow-ups (Herdy + Niran, 2026-11-23)

Niran: the UI is the only thing left, and anything may change, colours
included. Herdy designs on a branch and merges when it is ready; Niran keeps
the logic. Done on `herdy-work` the same day (MASTER_ROADMAP status): the
header's duplicate fit-report button, a green Sign in, the right-hand phone
menu, the footer's copyright line, the sample report under the shared
header. Still open:
- **A colour exploration** (Herdy): three palettes are on `herdy-colours`
  (`app/palettes.css`, preview builds only; the default theme is unchanged).
  Herdy picked **Blue Court** on 23 Nov to show on Fri 27 Nov; checked on the
  public and the signed-in pages. Niran's OK is next. Then: make it the
  default tokens, recolour the fixed-hex icons and share images (`app/icon`,
  `apple-icon`, `opengraph-image`, `twitter-image`, `manifest`), and update
  the token list in DESIGN_MOCKUP_SPEC_V2.
- **The same design on the signed-in pages**, once the public pages are final.
- **School logos** (Herdy, 23 Nov): the tile is built on `herdy-logos` from
  public-domain files only (`docs/SCHOOL_LOGOS.md`): 11 of 37 schools have
  one, 22 have a file we may use but Wikimedia's server was refusing
  downloads that day, 4 have none. Before that branch is pushed: the
  repository private, or the files kept out of it. Before it goes live: also
  Niran's OK, and an adult or lawyer on the trademarks. Schools without a
  logo keep their initials.
- **Two green buttons on one desktop screen** (rule 1; Herdy and Niran to
  choose): with Sign in green, /sample-report ("Get my free fit report", right
  under it), /pricing ("Choose Player") and /contact ("Email us") each show
  two. /onboarding already keeps Sign in plain (`PLAIN_SIGN_IN_ROUTES`,
  `components/seeded/layout/nav.tsx`).
- **A background picture** for the court hero, if Niran sends one.
- Niran reports the Google sign-in redirect is fixed (the redirect URL in
  Supabase, 23 Nov). A real Google sign-in test is still open.

### Parent dashboard upgrade (Niran's #1, 2026-11-16)

1. **Parent dashboard upgrade** (Niran's #1). The player's UTR trend as the
   hero — real results plus a dashed "Estimate" junior-year projection with
   the slow/fast band; a KPI row (UTR change, Target+Likely by junior year,
   coaches emailed/replied, season spend vs budget); per-category budget bars
   that turn amber at 90% and RED with one calm sentence when over budget
   (icon + text, never colour alone); a budget-vs-actual mini chart; the
   last 5 expenses; parent next-actions; teaching empty states. Monarch's
   trend-as-hero, Copilot's calm polish, YNAB's budget-vs-actual — in
   Seeded's own design system, light and dark. **Build it on tonight's
   plumbing:** `pickFamilyPlayer()` for the subject, `DataSubject` loaders
   for every number, `parentScopeSentence()` for the story. **A player
   switcher** belongs here too: a family with two players sees one of them
   (deterministically the first to join), and Settings says "Reports show
   one player for now".

### Fit and projection

11. **The projection's ceiling is silent.** `cappedByCeiling` (lib/fit.ts)
    is computed and never shown: a Class of 2034 player at 8.7 projects to
    14.0, the realistic ceiling, with typical and fast growth equal. Say so
    on the screen when it happens. Small.
12. **In the last hours before June 1 of the target summer** the projection
    rounds to today's rating but is still chipped "Estimate". Cosmetic; flip
    `isProjected` when the remaining time is under a day.
9. **P1-FIT-3** — projections are still nonsense on noisy data ("Projected
   4.3" for a 5.81 player). Needs outlier rejection and a floor.

### Left open by the review-ready sweep (R9, 2026-11-20) — `~/seeded-evidence/review-ready/r9-sweep/SWEEP.md`

- **M1 — budget expenses cannot be edited or deleted.** `lib/db/family.ts`
  has load + insert only. Add update/delete (RLS already allows a parent:
  `budget_expenses_write_update/delete`) and an Undo toast like Results.
- **M2 — a parent's /schools shows "Saved 0"** while the parent Overview
  says the player has 3 targets: the browser reads the signed-in parent's
  own (empty) list. Use the player's targets from `family_members()`.
- **GPA rules disagree**: Settings accepts 0–5 (the DB CHECK, weighted GPAs);
  onboarding's `parseGpaText` (lib/onboarding/diagnostic.ts) caps at 4.0.
  Pick one rule (likely 0–5) and share `lib/profile-fields.ts`.
- **The GPA field says "Unweighted GPA" but accepts up to 5.0** (the DB
  CHECK, which exists for weighted GPAs). Pick one meaning and relabel.
- **A blank name already stored** still loads as the login email in Settings
  (`lib/auth.ts` fallback). It can no longer reach the coach email.
- **Low**: mixed date formats; "11.00" vs "11.0" for the same estimate;
  "Schedule" vs "Training calendar"; "Male" vs "Men's"; no `global-error.tsx`;
  a contradictory Google sentence in the privacy policy (`lib/legal/policy.ts`
  ~130); the `my-consent-state` SWR key is not per-user; `/./login` as
  `?next=` causes one extra bounce (never a loop).

From the 2026-11-21 NEXT 10 (`archive/ROADMAP_HISTORY.md`):

Still open from the R9 QA sweep after `fix/sweep-1` (row status in
`~/seeded-evidence/review-ready/r9-sweep/SWEEP.md`): H1's database half is
DONE (051, on production 2026-11-21; the sign-up INSERT is still uncovered —
TODO). Still open: M1, M2, M4, M5, M8, L2, L3, L5–L7,
L9–L11.

### Smaller product items

9. **Players' theme follows the account, not the device.** Signed in, the
   stored theme overrides the browser's on every load (DesignPreferenceSync
   pulls it). Tonight stopped the per-page-view WRITE; whether a phone and a
   laptop should share a theme is a product call.
- `/parent-signup` asks a parent for their Gender and Grade in school. They
  are the player profile's fields on a form that is not the player's. Not
  new, now more visible since the step gained a birth year.
- Pricing comparison table at 390px: 640px table in a 350px scroller, only
  the Free column visible, no scroll affordance (P2).
- **The homepage calculator puts its answers in the URL**
  (`/onboarding?utr=…&gradYear=…&gender=…`) — move them out (e.g. the
  sessionStorage hand-off the diagnostic already uses). From the owner's list
  in §1, where it is the one code item.

### From PR D (2026-11-19)
- ~~`tournaments_goal` defaults to 12 and nobody is ever asked~~ — DONE on
  `fix/no-invented-goal` (migration 049, 2026-11-20): nullable, no default,
  every stored 12 cleared; asked (optional) in the diagnostic and Settings →
  Profile; played is counted from `tournament_entries`. Still open from it:
  drop the unused `profiles.tournaments_played` column (049 left it); decide
  whether `family_members()` should return the planned count (a parent sees
  "Not tracked" today because 037's enumerated list excludes it).
- Public LCP is still 2.7–3.3 s on most routes (target 2.5): ~285 KB of JS
  before first paint. Next steps in `docs/archive/audit-2-perf.md` (async
  `getSupabase()`, framer-motion `LazyMotion`). Re-measure production after
  merge with `scripts/perf-lighthouse.mjs`.
- Family dashboard pace wording ("At the pace in X's logged ratings") has no
  upside sentence; `utrDeltaOverMonths` / `computeMyPaceUTR` are test-only now.
- An opponent's UTR in a coach-email result sentence is not labelled
  "(self-reported)".
- The Events calendar heading still says "Training" though it shows
  tournaments too (mockup) — needs a design call.
- A pre-033 account with no `birth_year` can pick one in the signed-in
  diagnostic but it isn't saved (write-once column).
- `scripts/sweep-c.mjs` depends on a staging persona password that no longer
  exists by design; document how to set and scramble one per run.

## 5. Catalog and data

10. **P1-DATA-1** — real roster import (migration 012, reserved). Still the
    highest-value product task: a 5.81 player has zero schools in range and
    every roster number reads "Unverified estimate". P1-FIT-4 made this
    sharper, not softer — a 3.0 visitor now correctly sees 0 programs in
    range, which is the honest answer and a bad product.
    *(2026-11-22: catalog phase 1 is on in production — 35 imported programs,
    34 with sourced ranges, in migration 048's tables. The 68 legacy programs
    are still estimates.)*

- **Replace the legacy estimates** that the imported programs duplicate —
  DONE in code on `feat/sheet-sync` (2026-11-22; `lib/catalog/merge.ts`, 22
  teams), on staging. Production: migration 053 + the sheet re-import on
  Niran's go (HANDOFF §J Step 28).
- **Coach names and published staff emails** (sheet's Program Info tab, read
  from official staff pages). Not imported: Niran decides whether to show
  them. Showing them means a new migration, lifting the coach-field guard in
  `lib/db/schools-catalog-honesty.test.ts` in the same commit, and the source
  URL beside every address.
- **A saved program can leave the catalog** (independent review #4,
  2026-11-22, MEDIUM — not reachable for about a year). A sheet-only program
  drops out of `getSchools()` if its range goes stale (365 days), a newer
  invalid range is entered, or the flag goes off; a Free player's saved slug
  then still uses a target slot (use-star-schools counts raw slugs) but
  cannot be seen or removed. Fix before the first range turns a year old
  (Nov 2027): keep once-added programs as "not rated" rows, or list
  unresolved slugs with a Remove button and count only resolvable ones.
- **Show a stale checked range as stale** (review #5, LOW): today a range over
  a year old silently falls back to the legacy estimate (or out of the
  catalog). DATA_QUALITY says "stale: show, don't compute" — carry it as
  display-only with "Last checked {date}".
- **Data column date drops the year** ("Checked Nov 2") to fit the column;
  the school page has the full date. Revisit if the column widens (review #6).
- **Re-run the sync when the sheet changes** (Big Ten is next per
  `docs/data/LAUNCH_DATA_SPEC.md`): export the four tabs, run
  `scripts/import-utr-database.ts --program-info …`, staging first, then
  production on Niran's go. The catalog re-reads within 10 minutes; school
  pages for NEW programs exist only after a redeploy (`dynamicParams = false`).

### Catalog phase 1 follow-ups (PR E review, 2026-11-20) — before the flag goes on

**The flag went on in production on 2026-11-22** (UTR database import).
These items were written for that moment and were not re-checked when it
happened; confirm each against the code and the database before closing it.

- **Importer is not atomic** (`scripts/import-rosters.ts --upsert`): it
  upserts a program, deletes its class counts, then inserts new ones. A
  failure in the last step leaves `players_listed > 0` with no counts, and the
  UI would read that as "0 seniors". Wrap each program in one transaction (or
  an RPC) before the first production import.
- **Admin error text is too generic**: every RLS refusal (future date in UTC,
  inactive account) shows "Only an app admin can add a range." The form
  compares against the browser's local date while Postgres uses UTC
  `current_date`. Map the cases and compare in UTC.
- **Weak source checks**: `source = '...'` and a 1900 source date are accepted
  (shown greyed, never banded). Tighten the CHECKs in a follow-up migration.
- **`programs.head_coach` is readable by anon** through the table grant (real
  names as printed on roster pages; not rendered). Narrow the grant to the
  columns the UI uses, or drop the column, before the flag goes on.
- **`--emit-sql`'s safety check** only tests that 048's tables exist, so it
  stops distinguishing staging from production once 048 is on production.
  Give staging a marker row and check for it.
- **The roster TSV in `docs/data/` named ~1,900 real college students** (and
  hometowns). DONE 2026-11-21 (Niran's decision): removed from the current
  tree, replaced by the per-team aggregate `docs/data/roster_counts_2026-27.tsv`;
  the owner keeps the raw file outside the repo in `~/seeded-private/`
  (chmod 600) and `.gitignore` blocks `official_rosters_*` and
  `seeded-private/`. **Still open — decide whether to purge the raw roster
  file from git history.** It was first committed in `f6b0ef1` (2026-11-20
  07:27 ET) and is in every commit from there until the removal; it is also
  still a current file on any branch cut before the removal
  (`demo/reviewer-preview` until that branch is deleted after the review).
  A purge is more than one force-push: `git filter-repo` on the file, a
  force-push of every branch (`main` is protected, so its protection must be
  lifted for that), a GitHub Support request to drop the `refs/pull/*` heads
  and cached views (a force-push cannot remove those), and re-cloning every
  local checkout and worktree.

## 6. Performance and SEO

### Public-page LCP

15. **LCP on a simulated slow-4G phone is 5.1–6.1 s** on every public
    route (Lighthouse mobile, local production build; performance 78–81,
    CLS 0, TBT ≈ 0). Six web-font families load on every page; start there
    (drop unused families, subset, `preload: false` on the decorative
    ones), then check field data in Vercel Speed Insights after launch —
    lab LCP on localhost is an estimate, not what users see.

### /sample-report reports no First Contentful Paint, so Lighthouse scores it 0

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

### /onboarding's server HTML is a spinner (found Night 2 by the review)

Low, but it is the top of the funnel and sitemap priority 0.9.
`OnboardingPageSwitch` only renders `SeededPreAuthOnboarding` once
`hydrated && !isAuthed`; before hydration it renders `<AuthGate>`, whose
unhydrated branch is a spinning element. So a crawler that does not execute
JavaScript sees a spinner, not the free fit report.

The `GATED_BUT_PUBLIC` exemption in `lib/seo/private-routes.ts` says
"a signed-out Seeded visitor gets SeededPreAuthOnboarding" — true for a
JS-executing client only. Lighthouse SEO scores 100 because it does not
check rendered content.

Not fixed because the fix is a real architecture decision, not a tweak: the
design choice was read from `localStorage`, which is why this could not be a
server redirect (that component was deleted with Legacy on 2026-11-20; re-check
whether the reason still holds).
Options are to server-render the pre-auth flow as the default and swap after
hydration, or to accept it and drop the page's sitemap priority.

### SEO (moved from SEO_CHECKLIST.md "Open", 2026-11-22)

- [ ] The Seeded homepage (`components/seeded/home/seeded-home-view.tsx`)
      renders two `<h1>` (mobile and desktop copies). Keep one.
- [ ] Structured data: none yet. `Organization` on `/`; `SportsTeam`
      (+ `CollegeOrUniversity`) on school pages once team data is sourced.
- [ ] Generic 404s: confirm production returns status 404 (not verified for
      this doc).

## 7. Code health, tests and dependencies

- **`Player.currentUTR: number | null`** — remove the in-memory `0` sentinel
  (139 uses in 38 non-test files, re-measured 2026-11-21). CLAUDE.md "The
  UTR placeholder" explains why; `lib/utr-sentinel.test.ts` keeps it safe
  meanwhile. MASTER_ROADMAP NEXT 10 #3.
- **File splits:** `lib/auth.ts`, the schools browser, `signup-flow.tsx`, the
  Today layout. Boundaries in `REVIEWER_GUIDE.md` §9; NEXT 10 #9.
- **Alerting:** errors are logged and uptime is checked hourly, but nothing
  alerts (NEXT 10 #10; TECHNICAL_ARCHITECTURE "Monitoring").

### The Legacy guard test is a lint, not a proof (PR-LEGACY review, LOW)

`lib/no-legacy-theme.test.ts` misses some re-adds (a capitalised "Legacy",
`dataset["design"]`, a renamed design value, imports of
`choseRetiredDesign()` outside `lib/appearance.ts`) and does not scan the
repo root, `public/` or `scripts/`. Same stance as `family-scope.test.ts`:
it catches the realistic regressions; review catches the rest.

The same stance applies to `lib/api-body.test.ts`'s body-reader detector
(L3, in §3).

### Dependency debt

- **`npm audit`: 23 advisories, all dev-only; production dependencies have
  0** (DECISIONS 2026-11-22). The non-breaking `npm audit fix` pulls a
  Sentry/OpenTelemetry tree in under `lighthouse`; the rest need vitest
  1 → 3+. ESLint 10 waits for Next 16 (eslint-config-next 15.5.x peers
  `eslint ^9`).

### Tests

- Test fixtures use real school names ("Duke") against the clearly-fake
  rule in CLAUDE.md. Low risk, pure-logic tests, but worth tidying.
