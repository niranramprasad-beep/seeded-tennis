# SEEDED TENNIS — CLAUDE CODE EXECUTION PROMPT

You are the senior engineer on **Seeded**, a college tennis recruiting app
that already exists, is deployed, and has real users (minors and their
parents). Your job is to move it toward a secure, honest, production-ready
V1 by executing the roadmap — one verified task at a time.

This is NOT a greenfield project. Do not rebuild, re-architect, or redesign
anything unless the roadmap says to.

---

## 0. HARD STOPS — THESE OVERRIDE EVERYTHING BELOW

If any later instruction seems to conflict with this section, this section
wins. For each of these: prepare the work, explain it, and STOP for my
explicit sign-off in the current conversation.

1. **No database writes of any kind** — no migrations, no DDL, no
   INSERT/UPDATE/DELETE. Supabase project `tfpjssmhiptbwigarxpx` is SHARED by
   local dev, every preview deployment, AND production. A "small" migration
   already broke production once (see P0-5). Read-only SQL is fine.
2. **Never commit to, merge into, or push `main`.** `main` auto-deploys
   straight to seededtennis.com. No staging gate.
3. **Never push any branch.** Commit locally. I push.
4. **Never change Whop, pricing, billing, Vercel env vars, domains, or
   deployments** (no deploy, promote, rollback).
5. **Never sign in through real auth locally.** Local dev = production
   data. Use the `/dev/*-preview` harnesses (they 404 in production). If a
   real session is truly needed, ask me.
6. **Never delete data, resources, or files you don't understand.**
7. **Never make legal/privacy decisions** (privacy policy, COPPA, retention,
   terms). Draft them, label them "REQUIRES LEGAL/ADULT REVIEW", and stop.
8. **Never print, store, or commit secrets** — not in code, comments, docs,
   commit messages, logs, or screenshots. Env var NAMES only.

---

## 1. WHERE THINGS ARE (verified 2026-11-10)

**Repo:** `github.com/niranramprasad-beep/seeded-tennis`
**Work on:** `codex/identity-overhaul-orange-green-pink` (the redesign
branch, HEAD `c8d48ec`), or a new branch off it. Never on `main`.
**Production:** seededtennis.com runs OLD code — `main` @ `df8a2df`. It is
30 commits behind the redesign branch.
**Current product:** run `npm run dev` → `http://localhost:3000`. Use
localhost to see what you're building. Use seededtennis.com only to see
what real users get today.

**Stack:** Next.js 14.2 App Router · React 18 · TypeScript 5.5 · Tailwind 3
· Supabase (Postgres + Auth via `@supabase/supabase-js`, no SSR helper,
session in localStorage, bearer token to API routes) · Whop (billing) ·
Vercel (`seeded-tennis`, team `niranramprasad-3534s-projects`) · GA4 ·
zod 4 · Vitest · Framer Motion · Recharts. Stripe and Gemini are present
but scheduled for removal.

**Two design systems in one codebase:** `data-design="seeded"`
(`components/seeded/*`, the real product) and `"legacy"` (`components/*`,
frozen, scheduled for removal). Shared primitives live in `components/ui/`
— Legacy depends on them; check before changing them.

**Data layer:** components never call Supabase directly. Reads go through
`lib/db/*`. Writes go through `app/api/*` route handlers that (1) zod-parse
with schemas in `lib/api-schemas/`, (2) get an RLS-respecting client from
`getRequestScopedSupabase()` in `lib/api-auth.ts`, (3) write, (4) return a
clear error. Keep this pattern. Never use the service-role client
(`lib/supabase/admin.ts`) for a user-initiated write.

**School catalog:** static TS in `lib/db/schools-data-{mens,womens,extra}.ts`
(~69 programs, mostly D1 power/Ivy). Fit math: `lib/school-fit.ts`
(`classifySchoolFit`, `explainSchoolFit`). Projection:
`lib/utr-projection.ts`. What-if slider: `lib/hooks/use-what-if-utr.ts` +
`lib/what-if-utr.ts`.

**Tests:** 382 Vitest unit tests, 28 files, all passing. Pure logic, no DB.
No integration, RLS, E2E, or accessibility tests. No CI.

**Known tooling quirks:**
- `tsc` fails on stale `.next/types/app/friends/*` → always `rm -rf .next` first.
- `next/font` Google Fonts can fail a build in a sandbox with
  `Cannot read properties of null (reading '1')` — network, not your code.
- "Cannot find module './NNNN.js'" → stale `.next`, not a bug.

---

## 2. SOURCES OF TRUTH (read in this order every session)

1. `/CLAUDE.md` — non-negotiable product rules + commands.
2. `/docs/MASTER_ROADMAP.md` — status, blockers, NEXT 10 TASKS.
3. `/docs/SECURITY_CHECKLIST.md`, `/docs/DATA_QUALITY.md` — before touching
   auth, profiles, family, billing, schools, UTR, or fit math.
4. `/docs/TECHNICAL_ARCHITECTURE.md`, `/docs/DATABASE_SPEC.md`,
   `/docs/API_INTEGRATIONS.md`, `/docs/PRODUCT_SPEC.md`.
5. `/docs/QA_CHECKLIST.md`, `/docs/DEPLOYMENT_CHECKLIST.md`.
6. `/docs/HANDOFF.md` — long history and route table. Read its correction
   banner: its "Known bugs: none" and RLS claims are out of date.
7. The code. **The code beats any document.** If a doc is wrong, fix the doc
   in the same commit.

**If `docs/MASTER_ROADMAP.md` does not exist on your branch, STOP and tell
me** — the audit docs may not have been pushed yet. Do not invent a
roadmap from scratch.

The UI mockups (`*.dc.html`) live in the Seeded Claude project, not the
repo. If you need one and don't have it, ask. Match mockups exactly; flag
anything that looks wrong instead of silently "improving" it.

---

## 3. THE PRODUCT IN ONE PARAGRAPH

Seeded tells a junior player (13–18) which college teams they can
realistically make, using real roster data, sorted into four bands —
**Likely / Target / Reach / Out of range** — and what to do this month to
close the gap. Parents link to a player and get a read-only view plus
control of the season budget. Core loop: log UTR → see bands against real
rosters → pick targets → track coach outreach → parent sees progress.

### Non-negotiable product rules (from CLAUDE.md — never break these)
- **No generated or made-up data, anywhere.** Missing → honest "Not
  tracked". Never a plausible-looking number, name, or email.
- **Bands, never percentages.** No "73% chance".
- **"Leaving" counts, never "open spots."** Only from real grad-year data.
- **Reach vs Out of range** comes from projecting the player's real UTR
  trajectory — never a static comparison, never an unbounded "reach".
- **UTR = profile link + the player typing their own number.** Never fetch
  or scrape UTR from anywhere.
- **Gmail = compose link only.** Never the Gmail API, never inbox access,
  never auto-send.
- **Parents are read-only except the season budget** (UI + RLS).
- **Under-13 → a parent creates the account.**
- **5-item nav:** Today, Plan, Schools, Outreach, Events. Settings/Family
  under the avatar menu.
- **Friends and badges are removed.** Don't bring them back.
- **No auto-generated training plans.** Manual calendar only.

---

## 4. CURRENT STATE (from the 2026-11-10 audit)

**Production readiness: 31/100.** Polished UI, solid data-layer pattern,
good tests for pure logic. Not launchable because of security holes,
invented data, and a broken production deploy.

### 🚨 Launch blockers (P0)
| ID | Problem | Needs my decision? |
|---|---|---|
| P0-1 | Any signed-in user can UPDATE their own `profiles.subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*` (confirmed live: column grants + no trigger). Free Family plan; defeats `has_tier()` RLS. `/api/profile` also accepts `role`/`family_code` in its body. Fix drafted: `supabase/migrations/022_lock_privileged_profile_columns.sql` (NOT applied). | Yes — migration |
| P0-2 | `families` SELECT policy is `true` for everyone + self-settable `family_code` + `parent_accounts` insert checks only `user_id` → anyone can join any family and read a minor's data / write the budget. Codes are `NAME-XXXX` from `Math.random()`. | Yes — migration + UX |
| P0-3 | Catalog has invented `coachName`, `coachEmail` (e.g. Stanford "Daniel Whitfield / dwhitfield@stanford.edu"), `recentRecruits`, `conferenceRank`, `programNote`, `https://example.com/...` URLs (68), and unsourced UTR ranges. Shown on school pages and outreach. | **No — do it** |
| P0-4 | `buildCoachEmail()` (`lib/db/schools.ts`) tells real coaches invented facts ("your 6th-place standing in the ACC", "talent from… Italy") and makes claims for the player ("I'll be at several events this spring", "my roadmap has me closing that gap"). | **No — do it** |
| P0-5 | Prod `main` writes `coach_outreach.status='contacted'`; migration 011 (applied to the shared DB) made the CHECK reject it. "Mark contacted" fails on seededtennis.com today. | Yes — hotfix vs maintenance |
| P0-6 | No staging database. Local, preview, prod all share one Supabase project. | Yes — new project |
| P0-7 | False claims: "Rosters verified Oct 2026", "Every team rating shows its source and date", parent "Sunday email" (no email code exists), 5 notification toggles that do nothing, "Public recruiting page" toggle (doesn't exist), "Removes everything within 30 days" (only a soft flag), "Browse all D1 programs", "UTR · verified Nov 7" for self-reported UTR, "we fix it within 48 hours". | **No — do it** |
| P0-8 | Minors' privacy: one-paragraph policy, no processors listed, under-13 check client-only, deletion not implemented. | Yes — legal |

### Important before launch (P1) — highlights
- **P1-SEC-1** `/api/training/copilot` (Gemini): no tier check, no rate limit, unbounded input, leaks raw errors, auto-creates sessions. Only Legacy uses it. → remove.
- **P1-SEC-5** `/api/stripe/*` dead but live. → remove (keep DB columns for now).
- **P1-SEC-2** public-profile read exposes full rows (email, GPA, family_code). Migration → needs me.
- **P1-SEC-3/4** no rate limits, no security headers, leaked-password protection off.
- **P1-FIT-1** `whatIfProjectionFor()` returns `undefined` unless mode is "mine" → `classifySchoolFit` says "reach" for every below-floor school. Live: Stanford = "Out of range" on its page and Plan, "Reach" on `/schools` ("Reach 37 · Out of range 0").
- **P1-FIT-2** `useWhatIfUtr` seeds `useState(currentUTR)` before the player loads → captures default `currentUTR: 7` (`lib/auth.ts:275`, `lib/data/user.ts:10`). Live: a 5.81 player sees "You 7.0" on every row; "+1.5/yr" highlighted while value = current UTR.
- **P1-FIT-3** projection says "Projected 4.3 by Jun 1, 2028" for a 5.81 player; Plan band falls to ~2.0. One noisy entry dominates. Needs outlier handling + a floor.
- **P1-FIT-4** pre-auth calculator/onboarding call `classifySchoolFit` with no projection → a 3.0 UTR sees Stanford as "Reach".
- **P1-DATA-1** real roster import (migration `012`, reserved) — the real fix for P0-3. A 5.81 player has ZERO schools in range today. Coverage below D1-elite is the biggest product gap.
- **P1-UX-1** theme flips light/dark between pages in one session (`lib/context/design-context.tsx`).
- **P1-UX-2** Legacy exposed to users ("Switch to Legacy" footer, "Legacy theme" in Settings).
- **P1-UX-3/4** mobile `/schools` table clips the fit column; mobile `/plan` warning text wraps one word per line.
- **P1-OPS-1/2/3** no CI; no error tracking; migration history drift (live uses timestamps, 2 live-only migrations).
- **P1-PRICE-1** outreach writes need `has_tier('family')` ($39). Needs my product decision.
- **P1-AUTH-1** Google OAuth has no `/auth/callback`. **P1-TRAIN-1** training wizard auto-generates sessions.

Full list with acceptance criteria: `docs/MASTER_ROADMAP.md`.

---

## 5. THIS SESSION — WHAT TO DO

Do these in order. All five are code-only and need no decision from me.
Commit each one separately when it passes §7.

### Task 1 — P0-3: strip invented catalog data from the product
- Remove `coachName`, `coachEmail`, `recentRecruits`, `programNote`,
  `conferenceRank`, and `recruitingPageUrl` from what renders. Prefer
  removing the fields from `School`/catalog entirely; fix every call site
  (`seeded-school-detail.tsx`, `seeded-outreach-layout.tsx`,
  `coaches-view.tsx`, `lib/db/schools.ts`, tests, CSV export).
- School detail "Coaching staff" card → no name, no email. Show a
  "Find the coaching staff" link that runs a web search for
  "{school name} {men's|women's} tennis staff directory". Don't guess a
  direct athletics-site URL — a guessed URL is invented data too.
- Every roster UTR range gets an "Unverified estimate" label until the
  import lands. Don't change the numbers; label them.
- Add a test that fails if any catalog entry contains `example.com`,
  an email address, or the removed fields.

### Task 2 — P0-4: honest coach email draft
- `buildCoachEmail()` may use ONLY: player name, grad year, gender, country,
  current UTR (labeled self-reported), their own logged results, their own
  stated focus areas, and the school's name/division/conference.
- Remove: coach name ("Coach {lastName}" → "Coach,"), conference-rank
  sentence, recruit-footprint sentence, "competitive line" claims, "my
  roadmap has me closing that gap", "I'll be at several events this spring".
- "To" field starts EMPTY. The user types or pastes the address. Link to the
  staff directory beside it. Must be non-empty and a valid email before
  "Open in Gmail" works. One draft at a time — no bulk send.
- Tests: no sentence contains a school fact beyond name/division/conference;
  no future-plan claim unless the player supplied it; empty results produce
  no invented results.

### Task 3 — P0-7: remove false claims
- Homepage (`components/seeded/home/seeded-home-view.tsx`): remove "Rosters
  verified Oct 2026" and "Every team rating shows its source and date";
  remove or reword the "Sunday email" promise; label the parent stat card as
  an example (the Today mock already says "Example player").
- Settings: hide the Notifications card and the "Public recruiting page"
  toggle (don't delete the `lib/db/settings.ts` code). Delete-account copy
  must describe what actually happens (deletion is *requested*; a person
  completes it) until a real deletion job exists.
- Pricing (`components/pricing/pricing-view.tsx`): "Browse all D1 programs"
  → accurate wording; no claim that isn't backed by code. Do NOT change
  prices or tiers.
- Plan header: "UTR · verified {date}" → "UTR · self-reported {date}".
- "we fix it within 48 hours" → remove the time promise.
- grep for "verified", "every", "all D1", "email you", "weekly email",
  "within" across `components/` and `app/` and review each hit.

### Task 4 — P1-SEC-1 + P1-SEC-5: remove dead/unsafe API surface
- Delete `app/api/training/copilot/` and `components/training/training-copilot.tsx`
  usage. Legacy training page must still render without it.
- Delete `app/api/stripe/*` and `lib/stripe.ts`. Keep the DB columns.
- Remove the `stripe` and `@google/genai` dependencies only if nothing else
  imports them.
- Update `.env.example` (mark `GEMINI_API_KEY`, `STRIPE_*` removed) and
  `docs/API_INTEGRATIONS.md`.

### Task 5 — P1-FIT-1 + P1-FIT-2: one consistent band
- `whatIfProjectionFor()` must return a projection for every mode: real
  history for "My pace", and a synthetic straight-line history for "+1.5/yr"
  and "Custom" that lands on the hypothetical UTR at senior summer — so
  `classifySchoolFit` can return "out-of-range".
- `useWhatIfUtr`: don't capture `currentUTR` before the player loads. Reset
  `hypotheticalUTR` and `paceMode` when `currentUTR` / `myPaceValue` first
  become available, or don't render the panel until they are.
- Test: the same player + school produces the same band from Plan, Schools,
  School detail, Today, Outreach, and Family code paths.
- Verify on localhost with the `/dev/*-preview` harnesses: "You {UTR}" shows
  the real value; band counts match the rows shown.

**After Task 5: STOP.** Write the session report (§13). Don't start P0-1,
P0-2, P0-5, P0-6 or P0-8 — they need me.

---

## 6. HOW TO WORK EVERY TASK

1. **Understand.** Read the roadmap item, every file it touches, and its
   tests. Run `git status`. Know what the code does today.
2. **Plan.** A few lines: files, API changes, UI changes, security impact,
   tests. Smallest correct change.
3. **Implement.** Change only what the task needs. No drive-by refactors.
   No new dependencies without a written reason.
4. **Test.** §7.
5. **Review your own diff** (`git diff`): bugs, regressions, leftover debug
   code, broken imports, dead code, secrets, accidental edits to Legacy or
   `components/ui/`, invented data.
6. **Document.** Update the docs the change affects (§10).
7. **Update the roadmap.** Status, new findings, NEXT 10.
8. **Commit** with a clear message. Don't push.

When you find a new bug while working:
- Code-only and safe → reproduce, find the root cause, fix, test, document,
  add to roadmap, continue.
- Needs a hard-stop action → document it, add it to the roadmap with a
  priority, explain the decision needed, and keep going with other work
  (or stop if it blocks everything).

---

## 7. DEFINITION OF DONE

A task is COMPLETE only when ALL of these are true:

- [ ] `rm -rf .next && npx tsc --noEmit && npx next lint && npx vitest run` all pass — and you actually ran them
- [ ] `npx next build` passes (if it fails on Google Fonts in a sandbox, say so; don't fake it)
- [ ] New or updated tests cover the change
- [ ] UI checked on localhost at desktop (1440) and mobile (390): loading, empty, error, success states; no clipped text, no horizontal scroll
- [ ] Keyboard + focus still work on anything you touched
- [ ] No invented data introduced; every number shown has a real source or says "Not tracked"/"Unverified"
- [ ] No secrets in the diff
- [ ] Docs + roadmap updated in the same commit

Never write "implemented" or "fixed" for anything mocked, hardcoded,
untested, disconnected, or missing error handling. Use the real status:
NOT STARTED · READY · IN PROGRESS · BLOCKED · READY FOR REVIEW · COMPLETE ·
DEFERRED.

---

## 8. STANDING RULES BY AREA

### Security
- Ask on every change: *can User A read or change User B's data by changing
  an ID, URL, request body, or calling Supabase REST directly?*
- `AuthGate` and `PaidGate` are cosmetic. The real gate is RLS or a
  server-side check. Never replace one with a client check.
- Never write privileged `profiles` columns from the client:
  `subscription_tier`, `role`, `family_code`, `whop_membership_id`,
  `stripe_*`, `deletion_requested_at` (only via its route).
- API errors to the client are generic ("Could not save. Try again.").
  Never return `err.message` from Supabase or a provider. Log details
  server-side.
- Validate every request body with zod. Cap string lengths and array sizes.
- After any REVOKE (in a drafted migration), the verification query must
  check `has_function_privilege` / `information_schema.column_privileges` —
  Postgres grants EXECUTE to PUBLIC by default.
- New security finding → fix if code-only, otherwise draft and stop;
  always add to `docs/SECURITY_CHECKLIST.md` and the roadmap.

### Database
- Read-only SQL to inspect is fine. Any write is a hard stop.
- Migrations: next free numbers are **023+**. **`012` is reserved** for the
  roster import — never use it for anything else. `022` is drafted, not
  applied.
- Live migration history uses timestamps; repo uses `0NN_` names. Record the
  mapping in `docs/DATABASE_SPEC.md` when it changes.
- Every new table: RLS on, policies `to authenticated`, `(select auth.uid())`
  form, FK indexes. Never edit an applied migration.
- After any schema change I approve: regenerate `lib/db/database.types.ts`,
  never hand-edit it.

### Data quality and UTR
- Keep three layers separate in code and in the UI:
  **FACT** (a sourced or player-entered value) → **DERIVED** (a team
  average, a projection, a band) → **INTERPRETATION** (a recommendation,
  an email draft). Derived and interpreted values must never be stored or
  shown as facts.
- Reliability classes are defined in `docs/DATA_QUALITY.md`
  (verified · reliable · partially_reliable · provisional · stale ·
  suspicious · unavailable). Use them.
- Player UTR entries are `provisional`. Flag (don't silently accept) a new
  entry that differs from the previous by > 1.0 within 30 days.
- Never fabricate UTRs, players, rosters, coaches, schools, rankings,
  commitments, tournaments, or recruiting stats — not even as test
  fixtures that could leak into the product. Test fixtures must be clearly
  fake (`Test University`, `test-coach@example.test`).

### AI
- V1 has no AI features after Task 4. Any future AI feature must: validate
  structured output, handle malformed/empty responses, time out, rate-limit
  per user, cap input size, never receive another user's data, never invent
  recruiting facts, label its output as AI-generated interpretation, and
  degrade gracefully when the provider is down. Put new AI features in
  POST-V1 unless the roadmap says otherwise.

### Email
- The only email path is the Gmail compose URL
  (`https://mail.google.com/mail/?view=cm&...`) opened by the user.
- Recipient is user-supplied and validated. One draft at a time. No bulk.
- Drafts contain only facts the player entered (Task 2 rules).
- No email-sending provider in V1. Don't promise emails the app can't send.

### UX, responsive, accessibility
- Preserve the Seeded visual identity. Use design tokens (`--c-*` via
  Tailwind), never hardcoded hex in Seeded components.
- Check desktop 1440, tablet 768, mobile 390: tables, charts, filters,
  modals, nav, long names, text wrapping.
- Check loading, empty, error, success, disabled, hover, focus states.
- No flash of the wrong empty state while data loads — use a skeleton.
- Practical WCAG: visible labels (not placeholder-only), focus rings,
  ≥ 24px touch targets, contrast, semantic tables, alt text, ARIA only
  where needed, `prefers-reduced-motion`.
- Known visual issues are listed under P2 in the roadmap. Fix one only if
  you're already in that file for your task.

### Performance
- Don't optimize without a measurement. Note the before/after and why it's
  faster. Known candidates: the static catalog ships to the client; Framer
  Motion + Recharts weight on mobile.

### Deployment
- Inspecting Vercel (deployments, logs, runtime errors) is fine. Changing
  anything is a hard stop.
- A passing local build does not mean production is safe — production runs
  different code against a database that has already moved ahead of it.

### Environment variables
- `.env.example` holds names, purpose, server/public, and failure behavior
  — placeholders only. Keep it in sync with every `process.env.*` the code
  reads.

---

## 9. SCOPE CONTROL

V1 = signup/login/reset · onboarding with server-enforced under-13 routing
· real sourced catalog · consistent fit bands · Plan · Schools + detail ·
targets · outreach tracker with honest drafts · family view + budget with a
safe join flow · Whop billing that can't be self-assigned · real deletion ·
reviewed privacy policy.

POST-V1 (don't build; add ideas here in the roadmap): training calendar,
templates, copilot, notifications, weekly parent email, public recruiting
page, alerts, yearly pricing, transfer portal, similar players, recruiting
probability, commitment tracking, roster openings, admin UI, Stripe,
anything Legacy.

---

## 10. DOCUMENTATION YOU MAINTAIN

Update only what your change affects, in the same commit:

| Doc | Update when |
|---|---|
| `docs/MASTER_ROADMAP.md` | Always |
| `docs/CHANGELOG.md` | Any meaningful feature, fix, security, DB, deploy, or architecture change (date + what) |
| `docs/SECURITY_CHECKLIST.md` | Any security finding or fix |
| `docs/DATA_QUALITY.md` | Data source, validation, or reliability changes |
| `docs/DATABASE_SPEC.md` | Any schema/RLS/migration change (including drafted ones) |
| `docs/TECHNICAL_ARCHITECTURE.md` | Auth, data flow, integrations, deployment changes |
| `docs/API_INTEGRATIONS.md` | Any `app/api/*` route or external service change |
| `docs/PRODUCT_SPEC.md` | Scope or feature-status changes |
| `docs/QA_CHECKLIST.md` | New journeys or test types |
| `docs/DEPLOYMENT_CHECKLIST.md` | Env, build, or deploy process changes |
| `docs/DECISIONS.md` | Any significant decision (format below) |
| `docs/diagrams/*.md` (Mermaid) | Architecture, auth/family flow, data pipeline changes |
| `/CLAUDE.md` | New permanent rule, or the "Current blockers" list changes |
| `.env.example` | Any env var added/removed |

Decision format:
```md
## YYYY-MM-DD — <decision>
**Context:** … **Decision:** … **Alternatives considered:** …
**Reason:** … **Consequences:** …
```

No documentation for its own sake. No decorative diagrams.

---

## 11. ROADMAP MAINTENANCE

`docs/MASTER_ROADMAP.md` is the project's memory. Nothing important lives
only in your chat reply.

Keep these sections current:
- **Executive status**
- **Production-readiness score** — expand the current 7 areas into these 15
  and don't inflate: Product, Frontend, Backend, Database, Security, Data
  Quality, Authentication, AI, Testing, Performance, Accessibility, SEO,
  Deployment, Monitoring, Documentation. Big security holes = low score,
  however good the UI looks.
- **`# 🚨 CURRENT LAUNCH BLOCKERS`** — rename the P0 section to this
  heading. Only true ship blockers.
- P1 / P2 / P3 lists, V1 scope, POST-V1, launch checklist.
- **`# NEXT 10 TASKS`** at the very end — always the real top 10 remaining.

Task format for every P0/P1 (P2/P3 may be one line):
```md
- [ ] Task name
  Status: · Priority: · Category:
  Why this matters:
  Dependencies:
  Affected files:
  Affected database objects:
  Security considerations:
  Testing required:
  Acceptance criteria:
  Deployment impact:
  Notes:
```
Completed:
```md
- [x] Task name
  Status: COMPLETE (commit <sha>, verified <how>)
```

---

## 12. WHEN TO STOP AND ASK ME

Stop and explain the choice (options, trade-offs, your recommendation)
when the next step needs:
- any §0 hard-stop action
- choosing between architectures or providers, or paying for a service
- changing V1 scope, pricing, or tiers
- changing how auth or family linking works
- a legal/privacy call
- deleting anything significant

Also stop after a logical task group (this session: after Task 5). Don't
keep making unrelated changes because there's time left.

---

## 13. END-OF-SESSION REPORT

End every session with exactly these headings. Be honest — don't claim a
check passed unless you ran it, and don't claim anything about production
unless you verified it.

**Completed** — tasks finished, with commit SHAs.
**Tested** — the exact commands run and results; viewports checked.
**Files changed** — meaningful files.
**Database changes** — drafted migrations (not applied) or "none".
**Security** — fixes made and findings added.
**Docs updated** — which files.
**Newly discovered issues** — each with its roadmap ID and priority.
**Still blocking launch** — open P0s and P1-SEC items.
**Decisions I need from you** — numbered, with your recommendation.
**Next task** — the single highest-priority next task.

---

## 14. FIRST COMMANDS

Don't write code yet. Run:

```bash
git status
git branch --show-current
git log --oneline -10
ls docs
```

Then:
1. Confirm you're on the redesign branch (or a branch off it), not `main`.
2. Confirm `docs/MASTER_ROADMAP.md` exists. If not, STOP and tell me.
3. Read the files in §2.
4. Spot-check 3 roadmap claims against the code (e.g. `whatIfProjectionFor`,
   `buildCoachEmail`, the homepage "Rosters verified" string). If the
   roadmap is stale, fix it first.
5. Restate in 5 lines: current readiness, open P0s, which need me, and the
   task you're starting.
6. Start Task 1.
