# Independent verification of the overnight run

**Verified:** 2026-11-15, by an agent that did not do the work.
**Repo state at verification:** `v1` @ `1d1354a` (Task 5 landed mid-verification;
re-checked afterwards — it changes none of the findings below).
**Method:** every row was checked by running a command, reading the live
database, or driving the built app in a browser. `docs/OVERNIGHT_REPORT.md`
was treated as claims to falsify, not evidence. Code comments were treated
the same way.

**Result: 18 PASS · 6 PARTIAL · 1 FAIL.**

---

## The table

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Production build passes 3× in a row | **PASS** | `for i in 1 2 3; do rm -rf .next; npx next build; done` → `build 1 exit=0`, `build 2 exit=0`, `build 3 exit=0`. 135/135 static pages each time (the report's "132/132" predates `/privacy` and the other Task 3/4 routes). |
| 2 | No `next/font/google`; fonts load from local files | **PASS** | `grep -rn "next/font/google" --include="*.ts*" --include="*.mjs"` → 3 hits, all comments (`next.config.mjs:13`, `app/layout.tsx:12,14`). `app/layout.tsx:2: import localFont from "next/font/local"`. `ls app/fonts/` → 12 woff2, `du -sh` → 324K. |
| 3 | Remaining audit criticals/highs documented, and the documented reasons are true | **PARTIAL** | `npm audit --omit=dev --json` → `{"high":1,"critical":1,"total":2}`. Documented in `docs/DECISIONS.md:92-113`. The two checkable sub-claims are **true**: `grep remotePatterns next.config.mjs` → 0 hits; `grep -rn "next/image" --include="*.ts*"` → 0 imports, 0 `<Image` usages. `next@14.2.35` confirmed installed and confirmed the newest 14.2.x (`npm view next@14 version`). **But the characterization of the critical is wrong — see "Things the report gets wrong" #1.** |
| 4 | CI retry hack gone | **PASS** | `.github/workflows/ci.yml` — single `- name: Build / run: npm run build`, no retry loop, no `continue-on-error`, no `nick-fields/retry`. A comment explicitly forbids reintroducing one. |
| 5 | `@whop/sdk` version; handler reads `variant_id` | **PASS** | `node -e "require('@whop/sdk/package.json').version"` → `2.8.1` (package.json `^2.8.1`). `app/api/whop/webhook/route.ts:74: return data.variant_id ?? data.plan_id ?? data.plan?.id ?? null;` Also `checkout/route.ts:59` and `sync/route.ts:69,82`. |
| 6 | All billing tests pass | **PASS** | `npx vitest run lib/whop.test.ts lib/whop-sync.test.ts lib/whop-webhook-payload.test.ts lib/tier-gating.test.ts` → `4 passed`, `58 tests passed`. |
| 7 | `lib/whop-webhook-payload.test.ts` actually fails if the handler stops reading `variant_id` | **PARTIAL** | Mutation-tested on a scratch copy of the tree (repo untouched; `git status` clean after). **Mutation A** — delete `variant_id` from the route's reader → `1 failed \| 8 passed`. It fails, but *only* on the final source-grep test; the 8 behavioural tests stayed green. **Mutation B** — behaviour-*preserving* refactor (`const nested = data.plan?.id; return data.variant_id ?? data.plan_id ?? nested ?? null;`) → also `1 failed`. **Mutation C** — route changed to `return data.plan_id ?? null` with the asserted string left behind in a comment → **all 9 tests PASS** while the handler is completely broken. See "gets wrong" #2. |
| 8 | Screenshots for login/signup/pricing/family at desktop AND mobile | **PASS** | `ls docs/screenshots/` → all 8 of `task2-{login,signup,pricing,family}-{desktop,mobile}.jpg`, plus 2 Task 0 font shots, 2 `-BEFORE` shots and `task3-trajectory-2031-utr9.jpg`. Opened `task2-login-desktop.jpg` and `task2-family-desktop.jpg` — real renders, not blanks. Caveat on the family pair in "gets wrong" #6. |
| 9 | No hardcoded prices in rendered output | **PASS** | `grep -rn '\$12\|\$19\|\$39\|\$99\|\$159' --include="*.ts*" app components` → 5 hits, **every one a `//` comment** (`webhook/route.ts:180-181`, `paid-gate.tsx:22-23`, `billing-content.tsx:23`, `pricing-view.tsx:36`). Zero in JSX. |
| 10 | Google button renders ONLY when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` | **FAIL** | Built a clean copy with the flag **unset** and served it (`next build && next start -p 3199`). `/login` → no button. `/signup` → no button. **`/onboarding?utr=9&gradYear=2031&gender=women&gpa=3.5` → `find "Continue with Google"` returned `button "Continue with Google" [ref_107]`**, and the page text dump shows the button and its "or" divider. Positive direction verified separately (flag=true build on :3200 → button present on `/login` and `/signup`). Root cause in "gets wrong" #3. |
| 11 | Open redirect in the OAuth callback | **PASS (no bypass found)** | Read `lib/config/auth.ts safeRedirectPath` and fuzzed it with 29 payloads (protocol-relative, backslash, `%5C`, `%2F`, `%0d%0a`, `javascript:`, `\u0000`–`\u001f`, `\u0085`, ` /9`, ` `, `﻿`, `　`, `‎`, `///`, `/@`, `/..//`). **0 origin escapes** — every non-null return resolved to `https://seededtennis.com` under `new URL(out, base)`. All four `?next=` sinks are sanitized (`oauth-callback.tsx:83,89`, `complete-oauth-signup.tsx:38`, `login-form.tsx:32`, `lib/auth.ts:203`); the one unsanitized read is `authError`, which is `encodeURIComponent`'d into a query string, not a redirect target. |
| 12 | Google signup goes through birth year + under-13 consent | **PARTIAL** | The UI path holds: `/auth/callback` → no profile → `/auth/complete` (`oauth-callback.tsx:81-87`); `complete-oauth-signup.tsx:83` refuses submit without `isPlausibleBirthYear`, `:77` forces `familyMode: "join"` for under-13, and `completeOAuthProfile` (`lib/auth.ts:237-274`) calls the same `ensureSupabaseProfile` as the email path. **But the gate is client-side only.** On staging: `profiles.birth_year` `is_nullable = YES`, constraint is `check (birth_year is null or …)`, and `select consent_required_for_birth_year(null)` → **`false`**, i.e. `consent_status = 'not_required'`. A crafted profile INSERT with `birth_year` omitted produces a fully active account at any age. Pre-existing (migration 030), not introduced by Task 2 — but "is there a path that skips it" is answered yes. |
| 13 | `lib/fit.test.ts` covers all 7 named cases | **PASS** | `npx vitest run lib/fit.test.ts --reporter=verbose` → `20 passed`. Describe blocks: "Class of 2031, UTR 9", "Class of 2027, UTR 11 — a senior", "Class of 2028, UTR 6 — a junior at this date", "a current junior", "missing or impossible UTR", "out-of-range UTR", plus "Class of 2029, UTR 6 — one year out" and determinism/rounding. 7/7. |
| 14 | No LLM-produced number in `lib/fit.ts` / `lib/config/growth.ts` | **PASS** | `grep -nri "gemini\|openai\|anthropic\|claude\|llm\|generativeai\|fetch(\|ai-sdk\|model"` on both → only `fit.ts:16` ("DETERMINISTIC. NO MODEL PRODUCES ANY NUMBER HERE") and two unrelated comment words. Growth constants derive arithmetically from `REALISTIC_UTR_IMPROVEMENT_PER_YEAR` (min / midpoint / max). No `Math.random`; `new Date()` only as an injectable default, and the tests inject. |
| 15 | A 2031/UTR-9 player sees more than "all reaches" | **PASS** | Live at `http://localhost:3199/onboarding?utr=9&gradYear=2031&gender=women&gpa=3.5`: *"You're a realistic target for 8 programs"*, band counts **Reach 23 · Target 8 · Likely 0**, and *"Programs in range: 8 today → 31 by junior year."* Matches the report's numbers exactly. |
| 16 | UI shows "Estimate" and the assumption | **PASS** | Same page: `Estimate` chip beside `12.0`; *"Assumes typical growth of 1.0 UTR per year."*; *"Seeded has no growth data for junior players yet, so this is an assumption, not a forecast."*; *"Slower 10.5 · faster 12.5 (capped at the top of college tennis)"*; and the brief's verbatim line. |
| 17 | `/privacy` exists and builds; `/terms` links to it; footer links to it | **PARTIAL** | `/privacy` → HTTP 200, build log line 70: `├ ○ /privacy  187 B  96.6 kB`. Footer: `components/layout/footer.tsx` → `{ href: "/privacy", label: "Privacy" }` ✅, and `curl / \| grep 'href="/privacy"'` → 1. **`/terms` does not link to it** — `grep -rn "/privacy" app/terms/` returns one hit, inside a prose string: *"…is at /privacy."* Rendered as plain text; `find "privacy"` on the live `/terms` page returned only a heading, no link. |
| 18 | `lib/legal/policy.test.ts` checks the code, not the policy against itself | **PARTIAL** | `npx vitest run lib/legal/policy.test.ts` → `15 passed`. 6 tests genuinely read the code: migrations `029`/`030`/`027`, `app/api/account/deletion/route.ts`'s zod schema, `lib/db/schools.ts`, and a cited-path existence sweep. 9 are policy-vs-policy (processor names, email wording, retention wording, section ids, date/email format). Two structural weaknesses in "gets wrong" #4. |
| 19 | Three policy claims verified independently | **PARTIAL — 2 true, 1 false** | **(a) "Every table enforces who can read and write each row inside the database itself"** → TRUE: staging `pg_tables where schemaname='public'` = 25, `where not rowsecurity` = **0**. (The `source` field says "all 24 tables"; it is 25 — the source field is not user-facing.) **(b) "there is no public profile, no directory"** → TRUE: `pg_policies where policyname='profiles_discovery_read'` = **0**; 21 RESTRICTIVE policies present. **(c) "Parents are read-only everywhere except the season budget, which they can edit"** → **FALSE.** Staging has `encouragement_notes_insert_parent` — `INSERT … with check ((parent_id = auth.uid()) AND is_family_member(family_code))` — a second parent-writable table, shipped in the UI via `components/seeded/family/send-note-modal.tsx`. |
| 20 | `.env.local` points at PRODUCTION | **PASS — the report is right** | `grep -o "https://[a-z]*\.supabase\.co" .env.local` → `https://tfpjssmhiptbwigarxpx.supabase.co` (production). `SUPABASE_SERVICE_ROLE_KEY` is present and non-empty (name only read; value never printed). Local dev still reads and writes real users' data. |
| 21 | Staging E2E fixtures cleaned up | **PASS** | On `gnlcpnsweqbtwpaqhqqg`: `profiles where email like 'e2e-%@test.example'` = **0**; `auth.users` same filter = **0**; `families where code = 'E2EFAMILY001'` = **0**; `code ilike '%E2E%'` = **0**. Remaining: 6 auth users, 5 profiles, 1 family — all the original `*@test.example` seeds (`attacker-insert`, `parent-approved`, `parent-denied`, `player`, `sibling13`, `stranger`). `attacker-insert` is profile-less by design, which is why 6 users map to 5 profiles. |
| 22 | `tsc`, `lint`, `vitest` clean; exact count | **PASS** | `npx tsc --noEmit` → exit 0, no output. `npx next lint` → `✔ No ESLint warnings or errors`. `npx vitest run` → **43 files, 570 tests passed** at `1d1354a` (568 at `585167f`, the commit the report describes; Task 5 added 2). |
| 23 | Working tree clean; `v1` pushed | **PASS** | `git status --short` → empty. `git rev-list --left-right --count origin/v1...v1` → `0  0`. |
| 24 | Nothing pushed to `main` | **PASS** | `git log origin/main -1` → `d059006 Put production into maintenance mode`. `git rev-parse main origin/main` → identical. |
| 25 | No migrations applied to PRODUCTION | **PASS** | `list_migrations` on `tfpjssmhiptbwigarxpx` (read-only) → **23 migrations**, newest `20261110211058 performance_rls_and_indexes`. None of `022`–`032`. Production was not written to during this verification. |

---

## Claims I could not verify

- **The Whop live-API findings (Step 0, and the `variant_id` discovery itself).**
  I did not call the Whop API. That `variant_id` is the right field is
  corroborated by `@whop/sdk@2.8.1`'s own types (typecheck passes with
  `variant_id` on `Membership`, `ListMembershipsRequest` and
  `CreateCheckoutConfigurationsRequest`) and by the webhook test fixture, but
  the claim that `mem_xZKHm92QxEIqsS` returns that shape live rests on the
  report alone. **The webhook has still never fired successfully in
  production.** The fix is well-evidenced and plausible; it is not proven.
- **The 26 staging E2E checks in TASK 6.** The *end state* is verified
  (fixtures gone, 21 restrictive policies, `profiles_discovery_read` dropped,
  RLS on all 25 tables, `consent_required_for_birth_year` behaving as
  described). The 26 checks themselves left no artifact to re-run.
- **Font visual fidelity.** I verified no build-time network call and three
  clean builds; I did not re-run the browser `fontFacesLoaded: 18` /
  `anyGoogleSrc: false` measurement.
- **Vercel environment-variable state** (items (b), (h) in the report's
  hand-off list). Not checked — outside the repo and the two databases.
- **Whether migrations 022–032 behave on production.** They are applied and
  tested on staging only. Everything in items 12, 19 and 21 above describes
  **staging**, not seededtennis.com.
- **Build flakiness history.** "Failed about one run in two" before the font
  change is unverifiable now. 3/3 green today is real; the counterfactual
  is not.

---

## Things the report overstates or gets wrong

**1. The remaining `next` critical is described as one advisory. It is 26.**
The report and `docs/DECISIONS.md:102` both say the critical is *"DoS via
Image Optimizer `remotePatterns`"* and that *"the advisory is specific to
self-hosted apps."* That is true of **GHSA-9g9p-9gw9-jx7f only**. `npm audit
--json` shows the `next` entry has **26 `via` entries** collapsed under one
critical heading. Among the other 25, reachable on a Vercel-hosted App Router
app: cache poisoning in RSC responses (GHSA-wfc6-r584-vfw7), RSC
cache-busting collisions (GHSA-vfv6-92ff-j949), middleware/proxy redirect
cache poisoning (GHSA-3g8h-86w9-wvmq), cache confusion of response bodies
(GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q), unauthenticated disclosure of
internal Server Function endpoints (GHSA-955p-x3mx-jcvp), and DoS in App
Router Server Actions (GHSA-m99w-x7hq-7vfj, GHSA-p3m5-59mp-jv5r). The
*decision* to defer to a `next@16` major may still be right; the *stated
reason* for why it is safe to defer does not cover what is actually in the
bundle, and "both currently unreachable" in §3 of the report is not
supportable. `next@16` deserves to move up from "Week 1".

**2. The webhook payload test is a text-identity check wearing a behavioural
test's clothes.** Every behavioural assertion in
`lib/whop-webhook-payload.test.ts` runs against a **local copy** of the reader
declared at line ~110 of the test file. The route's own `planIdOf` is never
executed by any test. The single link to the route is
`expect(route).toContain("data.variant_id ?? data.plan_id ?? data.plan?.id")`
— a `readFileSync` + substring match. I proved both failure modes on a scratch
copy: a **behaviour-preserving refactor fails the test**, and a **route
rewritten to `return data.plan_id ?? null` passes all 9 tests** as long as the
asserted string survives anywhere in the file, including inside a comment.
The report calls this "a guard asserting the route still contains the same
readers, so the test cannot drift into testing its own local copy." It is
exactly the opposite: the local copy is all that is tested, and the guard
protects a string rather than a behaviour. The same pattern is in
`components/auth/google-button-flag.test.ts` and in six of the fifteen
`policy.test.ts` assertions. This repo has a house style of grepping source
text and calling it a regression test.

**3. There is a fourth, unguarded Google button, and it is live.**
`components/seeded/onboarding/seeded-pre-auth-onboarding.tsx:520-534` hand-rolls
its own "Continue with Google" button and its own "or" divider, calls
`signInWithGoogle()` directly, and **contains no reference to
`GOOGLE_AUTH_ENABLED` at all** (`grep` → 0 hits in that file). It renders on
`/onboarding` — a public, linked, SEO-targeted route — whenever `?utr=` is
present, which is the normal path through the funnel. I confirmed this in a
browser against a production build with the flag unset.

This is the *same bug* Task 2 reports having found and fixed, in a third
file. And the report's claim that
`components/auth/google-button-flag.test.ts` "fails the build if it moves
back out **or a fourth caller reimplements the button**" is false: that test
iterates a hardcoded list of three filenames — `signup-flow.tsx`,
`login-form.tsx`, `complete-oauth-signup.tsx` — and the fourth caller already
exists outside it. A `grep -rn "signInWithGoogle"` across `app components lib`
would have found it; the test greps three files by name instead.

Consequence for the morning plan: step (b) *"set the flag last, after (c)"*
does not protect anything. On `/onboarding` the button is already live with
the flag off, so the window the ordering was designed to avoid — button
visible, Supabase provider not configured — is open from the moment `main`
deploys, regardless of the flag.

**4. "Every claim is sourced, and the build checks it" is weaker than it
sounds — and one claim is false.** The file-existence sweep only matches
`/[\w./-]+\.(?:tsx|ts|sql)/`, so a `source` written in prose is checked
against nothing. The `parents` section's source — `"migration 019/023 RLS
policies; is_parent_member(); season_budgets write policy"` — contains no
matching path, so **zero** of it is verified by any test. That is the section
whose claim turns out to be wrong: *"Parents are read-only everywhere except
the season budget"* is contradicted by `encouragement_notes_insert_parent` on
staging and by the shipped `send-note-modal.tsx`. This also contradicts a
CLAUDE.md non-negotiable ("Parents are read-only except the season budget.
Enforced in the UI and at the RLS layer"), so the policy and the rule are
wrong together — pre-existing, but now written into a published privacy
policy about children's data. Separately, the `security` section's source says
"all 24 tables"; staging has 25.

**5. "/terms now points at it" is prose, not a link.** `app/terms/page.tsx:26`
ends a paragraph with *"…is at /privacy."* as literal text inside a string.
Nothing is clickable. For the Google OAuth consent screen (hand-off item (d))
the URL itself is what matters, so that is unaffected — but anyone reading
the terms cannot click through, and the report's phrasing implies they can.

**6. The `/family` screenshots are the dev harness, not `/family`.**
`task2-family-{desktop,mobile}.jpg` are `/dev/family-preview`, visibly showing
the superseded `CHEN-7K4P` code format. TASK 6 discloses this ("`/family`
(harness)"); TASK 2's "Evidence" section lists them among "8 screenshots in
`docs/screenshots/`" with no such caveat, and the "Rebuilt to spec" section
describes `/family` changes whose only visual evidence is a route that 404s
in production.

**7. The under-13 gate is client-side only.** Not claimed either way by the
report, but it is load-bearing for the TASK 4 privacy policy, which states
*"your account is created but does nothing at all until a parent or guardian
approves it. … That is enforced by the database, not by hiding buttons."* The
enforcement is real **once a birth year exists** — but `profiles.birth_year`
is nullable, its check constraint explicitly permits NULL, and
`consent_required_for_birth_year(null)` returns `false`, yielding
`consent_status = 'not_required'`. The only thing requiring a birth year is
`isPlausibleBirthYear` in the browser. Given that Task 5 found a Critical by
asking exactly this question about an INSERT path, this one is worth asking
before launch rather than after.

### What the report gets right

Most of it, and the parts that are hardest to fake. The three-build claim is
real. The font self-hosting is real and complete. `variant_id` is genuinely
read in all three routes with a backwards-compatible fallback. The fit
trajectory numbers (8 today → 31 by junior year, Reach 23 / Target 8 /
Likely 0) reproduce **exactly** in the running app, with the Estimate chip and
the assumption caption present as described. The price sweep is clean. No
hardcoded price, no `lorem ipsum`. Nothing was applied to production, nothing
was merged to `main`, `main` is still `d059006`, the tree is clean and `v1`
is pushed. The staging fixtures really were deleted. And the §1 item that
blocks launch hardest — `.env.local` still pointing at production, written up
as a correction to the agent's own earlier wrong claim in CLAUDE.md — is
accurate, and was the right thing to lead with.

---

## Reproducing this

```
cd /Users/niranram/seeded-tennis
for i in 1 2 3; do rm -rf .next && npx next build; done
npx tsc --noEmit && npx next lint && npx vitest run
npm audit --omit=dev --json | python3 -I -c "import sys,json;d=json.load(sys.stdin);print(d['metadata']['vulnerabilities']);[print(k,v['severity'],len(v['via'])) for k,v in d['vulnerabilities'].items()]"
grep -rn "signInWithGoogle" --include="*.tsx" --include="*.ts" app components lib
grep -n "GOOGLE_AUTH_ENABLED" components/seeded/onboarding/seeded-pre-auth-onboarding.tsx   # 0 hits
grep -rn "/privacy" app/terms/
```

For item 10, build a copy of the tree with no `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`
set, `next start`, and open
`/onboarding?utr=9&gradYear=2031&gender=women&gpa=3.5`.

For item 7, copy the tree (`git ls-files -z | rsync -a --files-from=- --from0`),
symlink `node_modules`, then edit `app/api/whop/webhook/route.ts` in the copy
only. Mutation C is the one that matters: replace the reader body with
`return data.plan_id ?? null;` and leave the old expression in a comment above
it. All 9 tests pass.
