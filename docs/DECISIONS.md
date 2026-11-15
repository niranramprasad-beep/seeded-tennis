# Decisions

Calls made without asking, because asking wasn't an option at the time.
Each one: what, why, and how to undo it.

Newest first.

---

## 2026-11-15 — next@15, not next@16

**Decision.** Upgraded `next` 14.2.35 → **15.5.29** (and
`eslint-config-next` to match). React stays on 18.

**Why.** The brief asked for the smallest version that clears every
critical/high `next` advisory. 15.5.29 does: the `next` finding drops from
**25 advisories (3 critical, 9 high, 11 moderate, 2 low) to zero criticals
and zero highs**. Going to 16 as `npm audit fix --force` suggested would
have pulled a second major's worth of breaking changes for no additional
security benefit, and 16 removes `next lint` entirely, which is a separate
migration.

Only one breaking change actually bit: `params` is a Promise in Next 15
(`app/schools/[slug]/page.tsx`). Dynamic APIs went async so a page can start
streaming before the router finishes resolving them. No `cookies()`,
`headers()` or `searchParams` call sites existed to migrate, and the caching
default change does not affect us — nothing relied on the old implicit
`fetch` cache.

**How to undo.** `npm i next@14.2.35 eslint-config-next@14.2.35` and revert
the `await params` change. You would be re-accepting 25 advisories.

---

## 2026-11-15 — Pin postcss with an npm override

**Decision.** Added `overrides: { postcss: "^8.5.23" }` and lifted the direct
devDependency to match.

**Why.** `next@15.5.29` bundles `postcss@8.4.31` at
`node_modules/next/node_modules/postcss`, which carries two **high**
advisories — arbitrary file read via an attacker-controlled
`sourceMappingURL`, and path traversal in previous source-map auto-loading.
npm's only offered fix was `next@16`, a major, for a transitive package that
an override fixes outright. npm refused the override while the direct
devDependency range conflicted, so that was lifted to the same line; both now
resolve to 8.5.33.

**Result: production dependencies have ZERO vulnerabilities**, down from
1 critical + 1 high (29 advisories between them).

**How to undo.** Delete the `overrides` block. Re-check it whenever `next` is
upgraded — once next ships a safe postcss itself, the override is dead weight.

---

## 2026-11-15 — Left the vitest chain on 1.6.1

**Decision.** Did not upgrade vitest. The remaining dev-only vulnerabilities
(2 critical, 2 high: `vitest`, `tinypool`, `vite`, `brace-expansion`) stay.

**Why.** vitest 5 cannot be installed without `--legacy-peer-deps` or
`--force` against the current tree, and the brief rules out forced
resolutions. It is also four majors of test-runner migration. None of it
ships: these affect the test runner and the linter, not a single byte served
to a user. **Production deps are at zero**, which was the actual bar.

**How to undo.** `npm i -D vitest@5 --legacy-peer-deps`, then expect config
and API migration work. Tracked in docs/TODO.md.

---

## 2026-11-14 — Rewrote two lines of the pricing mockup's copy

**Decision.** The spec's footer line is "Cancel in two clicks. Accounts for
players under 18 are billed to a parent." Shipped instead: "Cancel any time
from your Whop account. Players under 13 need a parent or guardian to
approve the account before it works."

**Why.** The second sentence is not true. Nothing in Seeded or in Whop checks
who owns the card — a 16-year-old can pay with their own — so it describes a
control that does not exist. The first is a measurement of Whop's UI, which
we do not own and cannot keep true. The replacement says the thing that IS
enforced, in the database, by migration 030. Both originals are now patterns
in `lib/copy-honesty.test.ts`, so they fail the build if they come back.

**How to undo.** Only if the controls become real. Delete the test entries in
the same commit that makes them true — never reword around them.

---

## 2026-11-14 — "3 months free", computed, not "2 months free"

**Decision.** The toggle reads "Yearly · 3 months free", from
`yearlyMonthsFree()` in lib/types.

**Why.** The mockup says 2. At today's prices yearly saves 3.75 months on
Player and 3.6 on Family, so "2" understates — and a promise that understates
is still a promise nobody checked. The helper floors the saving and takes the
minimum across paid tiers, so the number is true for whichever plan the
visitor picks and moves on its own when a price changes.

**How to undo.** Replace the call with a literal. Then own the literal.

---

## 2026-11-14 — "Parent" on /signup links to /parent-signup

**Decision.** The spec's "I am the" pill radio is on /signup. Choosing Player
does nothing (it is already selected); choosing Parent navigates to
/parent-signup.

**Why.** `SignupFlow` had a `role` state with no UI and no working parent
path — the parent flow is a separate page with different copy, different
fields and a different landing page. A half-parent mode inside the player
wizard would have been a worse version of a page that already exists.

**How to undo.** Make the Parent pill set local state and teach SignupFlow
the parent copy, then delete /parent-signup.

---

## 2026-11-14 — `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` added to .env.local

**Decision.** Appended to the local env file so the Google button renders in
local dev, matching what production will be.

**Why.** It was needed to verify the button actually appears with the flag
on — and finding that it appeared with the flag OFF is how the guard bug was
caught. The file is gitignored; nothing is committed.

**How to undo.** Delete the line.

---

## 2026-11-14 — Self-host all six font families, not the three named

**Decision.** The overnight brief named Inter, Inter Tight and JetBrains
Mono. I self-hosted those plus Cormorant Garamond, Space Grotesk and IBM
Plex Mono — every family `app/layout.tsx` loads.

**Why.** The point of the task is that the build makes no network call. Three
of six still fetching from Google leaves the failure exactly where it was,
just less often — and "builds 3× in a row" would have been luck, not proof.
The other three are Legacy concept-theme faces (P1-UX-2 will delete them with
Legacy); self-hosting them costs 112 KB of committed woff2 and removes the
last build-time dependency.

**How to undo.** Put the `next/font/google` imports back in
`app/layout.tsx` and delete `app/fonts/`. The CSS variable names are
unchanged, so nothing else moves.

---

## 2026-11-15 — CORRECTION to the entry below: it is 25 advisories, not one

**What I got wrong.** The entry below describes the remaining `next`
vulnerability as the Image-Optimizer `remotePatterns` DoS and concludes "both
currently unreachable". `npm audit --omit=dev --json` shows the `next`
finding bundles **25 separate advisories** — 3 critical, 9 high, 11 moderate,
2 low. I read the first one `npm audit` printed, verified its two checkable
sub-claims, and generalised to the bundle.

The two sub-claims are still true — no `remotePatterns`, zero `next/image`
imports, both re-verified. They just do not cover the other 24. Several are
squarely in scope for a Vercel-hosted App Router app: cache confusion of
response bodies, cache poisoning in RSC responses, unauthenticated disclosure
of internal Server Function endpoints, DoS in App Router via Server Actions,
XSS in App Router apps using CSP.

**What changes.** "Both currently unreachable" is withdrawn. The `next@16`
upgrade moves from Week 1 to **the top of Week 1, before the first paying
customer**, and `docs/TODO.md` is updated. It is still not a tonight job —
it is a major with App Router breaking changes, and doing it unreviewed at
midnight would be worse than the exposure.

**How this happened**, because the pattern matters more than the entry: I
verified the first item and asserted the set. The same shape as the
`family_code` INSERT hole found hours earlier — check one path, assume the
rest, write the assumption down as a finding. Found by an independent
verifier running `npm audit --json` rather than reading the summary line.

---

## 2026-11-14 — Leave the Next.js critical and the postcss high unfixed

**Decision.** Production dependencies went 5 vulnerabilities → 2. The two
that remain (`next` critical, `postcss` high) are only fixable by upgrading
to `next@16`, a major. Left in place, documented, not forced.

**Why.** The brief ruled out a major Next/React upgrade tonight. Both are
also unreachable in this app, which is the part worth checking rather than
assuming:

- **`next` — DoS via Image Optimizer `remotePatterns`.** We configure no
  `remotePatterns` (`grep remotePatterns next.config.mjs` → 0), import
  `next/image` in **zero** files, and deploy on Vercel rather than
  self-hosted. The advisory is specifically about self-hosted apps.
- **`postcss` — XSS via unescaped `</style>` in stringify output.** postcss
  runs at build time over our own CSS. No user input reaches it, and nothing
  ships postcss to the browser.

`next@14.2.35` is already the newest 14.2.x, so there is no patch inside the
major.

**How to undo.** `npm i next@latest eslint-config-next@latest` and fix the
breaking changes. Tracked in docs/TODO.md.

---

## 2026-11-14 — Remove `geist` and `pdf-lib`

**Decision.** Uninstalled both.

**Why.** Zero references anywhere outside `package.json` — checked across
`.ts`, `.tsx`, `.css`, `.mjs` and `.json`. `geist` is a font package the app
never used (it has its own faces); `pdf-lib` was presumably for a report
export that was never built. Unused dependencies are attack surface and
audit noise.

**How to undo.** `npm i geist pdf-lib`.

---

## 2026-11-14 — Remove the CI build retry

**Decision.** `.github/workflows/ci.yml` runs `npm run build` once.

**Why.** The three-attempt retry existed only for the Google Fonts flake,
which no longer exists now the fonts are local. A CI that passes on the
second attempt teaches people to re-run rather than read the failure.

**How to undo.** Restore the loop from git history — but if the build is
flaking again, find out why first.

## 2026-11-15 — `playwright-core` + axe as devDependencies, driving the installed Chrome

**Decision.** Added `playwright-core@1.49.1`, `@axe-core/playwright@4.10.1`
and `axe-core@4.10.2` as devDependencies, installed with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and pointed at the Chrome already on
the machine (`channel: "chrome"`).

**Why.** TASK B needs real `/family` screenshots taken through a real
sign-in, and TASK D needs keyboard walkthroughs, axe runs and before/after
mobile measurements. The in-app browser pane could not do it: it scales an
emulated 1440px viewport into an ~800px pane and mis-composites
`position: fixed` elements, which produced a screenshot showing the sidebar
overlapping the page content when the DOM geometry proved there was no
overlap (`aside` 0–232, `main` from 248). Evidence that is an artifact of
the capture tool is worse than no evidence.

**Cost checked, not assumed.** `npm audit --omit=dev` still reports **zero**
production vulnerabilities after the install, so TASK A's result stands. No
browser binaries were downloaded.

**How to undo.** `npm uninstall -D playwright-core @axe-core/playwright
axe-core`. Nothing in `app/`, `components/` or `lib/` imports them; the
capture script lives in the session scratchpad, not in the repo.

## 2026-11-15 — a null UTR renders "Not tracked"; `Player.currentUTR` keeps its type

**Decision.** Made the *family* UTR path nullable
(`FamilyMember.currentUtr`, `buildSeasonBudgetSummary`,
`pendingSkipDecisions`) and had the four family views print "Not tracked".
Left `Player.currentUTR: number` and its `emptyPlayer` placeholder of 7
alone.

**Why.** The bug was that `/family` showed "7.0 UTR" for an account whose
`current_utr` is NULL — the placeholder leaking onto a screen through
`playerMember?.currentUtr ?? player.currentUTR`. The root-cause fix in the
purest sense is `Player.currentUTR: number | null`, but that type has **79
read sites across 26 files**, most of them inside fit maths that CLAUDE.md
specifically warns must never receive a non-number
("Never pass `undefined` as the projection to `classifySchoolFit`"). A
79-site type change through the fit engine, at 1am, with the launch
rehearsal still ahead, trades a contained honesty bug for an uncontained
correctness risk.

The nullable boundary is drawn exactly where the unknown value enters a
screen. `classifySchoolFit` is never called with a substituted number — the
projection is null and the section is skipped.

**How to undo.** Revert the commit. **What to do instead, properly:** make
`Player.currentUTR` nullable and let the compiler find all 79, with the fit
engine's own null handling (`lib/fit.ts:94` already returns null for a null
UTR) as the pattern. That is a focused piece of work, not a 1am one.

## 2026-11-15 — did NOT widen cross-user reads to fix the joined-player gap

**Decision.** Found that a parent cannot read an approved joined player's
profile or UTR history at all (their `profiles.family_code` stays NULL and
both read policies require it non-null). Wrote it up in `docs/TODO.md` with
the evidence and three candidate fixes; did not change any policy.

**Why.** Every candidate fix widens what one user may read about another
user who is a minor. 027 and 030 each took a full attack-test pass in both
directions before being believed, and the same is owed here. It is also not
obviously a bug rather than a deliberate choice — 032 exists precisely
because claiming a family code is a takeover vector, so there may be a
reason 023/026 left the joiner's `family_code` NULL. Finding out is step one
of the fix, and it is a reading task, not a typing task.

It denies access rather than granting it, so nothing is exposed by waiting.

**How to undo.** Nothing to undo — no change was made. The write-up is at
the end of `docs/TODO.md`.
