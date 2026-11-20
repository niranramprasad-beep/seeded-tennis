# Seeded Revamp — Final Report

Done autonomously per your instructions. Everything below went through `revamp` first, then merged into `main` and **pushed to `origin/main`, which this Vercel project auto-deploys straight to `seededtennis.com`** — this is live for real users as of this push.

## TL;DR

- Every feature area in your brief got a real Seeded pass, including a second finishing round that closed out the auth forms (login/signup/parent-login/parent-signup/reset-password) and upgraded badges to real confetti particles — see "Finishing pass" below.
- `main` now matches `revamp`'s tip and has been pushed to `origin/main`, triggering a production deploy to `seededtennis.com`. Legacy is untouched and still the exact pre-revamp experience when you switch to it. `legacy-v1` stays tagged at the pre-revamp commit so you can always get back to the original site.
- **Heads up on the default flip**: Seeded is now the default design for every user who hasn't explicitly chosen Legacy — not just new signups. This is live now.
- One real site-wide bug was found and fixed during the original build (see below) — worth knowing about even if you only care about Legacy.
- An uncommitted, untested Codex change (GA4 purchase-tracking wired into the Whop webhook) was found sitting in the working tree before this push. It was **stashed, not shipped** — flagged as a Future task in `CLAUDE.md`/`AGENTS.md` with exact recovery steps, and spun off as a separate task chip. It never touched production.
- Budget held: `/dashboard` 243→245 kB, `/roadmap` 226→228 kB, `/training` 235→239 kB — all comfortably inside the ~40 kB allowance you gave.

---

## 1. What was built, chunk by chunk

### Step 0 — Architecture
A new `data-design` / `data-seeded-mode` attribute pair on `<html>`, fully independent of the existing 9-value `data-theme` system Legacy uses — flipping to Seeded never disturbs a Legacy user's palette choice. State lives in `lib/context/design-context.tsx`. Signed-out visitors get localStorage persistence (flash-free on the same device, same mechanism Legacy's theme picker already used). Signed-in users get their choice written to their profile via a new `lib/supabase/design-preference.ts`, which reuses the **existing** `user_settings.notification_preferences` JSONB column — no schema change. Fixed a real bug this uncovered: `saveTrainingPlannerState`'s write to that same column was a blind overwrite that would have silently erased a saved design preference the next time you used the training planner; it now reads-then-merges. Footer got a "Switch to Legacy" link, visible only in Seeded mode.

### Chunk 2 — `/dev/design`
An internal (dev-only, 404s in production builds) style-guide page: color tokens, type scale, buttons, elevation levels, a bento-grid demo, a `Reveal`-stagger demo, with a live dark/light toggle scoped to the page. Reviewing it with screenshots is what caught the one real bug flagged below.

### Chunk 3 — Marketing pages
How it works, For parents, Contact, Terms. How it works and Terms got the full glass/gradient/bento treatment. Parents is deliberately the **calmest** page in the system — muted icon circles, plain bordered cards, no gradient-mesh or cursor glow — per your "distinct, calmer feel" direction.

### Chunk 4 — App shell
Nav/sidebar were already re-skinned earlier this session (as "Premium," renamed to "Seeded" in Step 0). The new piece: a real **Cmd/Ctrl+K command palette** (`components/seeded/shared/command-palette.tsx`) — fuzzy filter over the same routes the sidebar shows, fully keyboard-navigable, plus a "Jump to… ⌘K" button in the sidebar for anyone who wouldn't find the shortcut.

### Homepage
Rebuilt earlier this session with a genuinely different composition (not a recolor): full-bleed ambient gradient hero, scroll-reactive headline, cursor-tracked ambient glow, asymmetric bento grids for the capability/how-it-works sections.

### Every named feature area
Dashboard, Roadmap, Schools (browser + detail), Tournament fit, Coach outreach, Matches, Match mode, Training/calendar (done earlier this session), Cost calculator, Friends, Badges, Family, Settings, Pricing, Onboarding — all done. Depth varied by priority (see decisions below).

### Finishing pass (before this push to production)
You asked me to close out anything still unfinished before shipping to `main`. Two things got done:
- **Auth forms now have a bespoke Seeded layout** — login, signup (both player and parent, via the shared `signup-flow.tsx`), parent-login, and reset-password all get the glass-card treatment, Seeded display font on headings, and gold uppercase eyebrows, matching the rest of the app. Previously they only inherited Seeded's *colors* automatically (shared CSS variables) but kept Legacy's plain layout — which meant a real user hitting "Sign up" mid-flow would've seen something that looked like a different, older product. Auth *logic* (Supabase calls, session handling, validation) was not touched at all.
- **Badges unlock celebration upgraded to real confetti** — `components/seeded/shared/confetti-burst.tsx`, a hand-rolled particle burst (framer-motion, no new dependency), replaces the scale/glow-only placeholder. Colors pull from the existing theme-aware tokens, so it reads correctly in Legacy too, not just Seeded.

Two items were reconsidered and deliberately left alone, not for lack of time:
- **Coach outreach's "email types itself in"** — still skipped. `buildCoachEmail` is synchronous (no network latency to mask), so a typing animation would be pure decoration layered onto an instant operation, and the only way to make it real is to animate into the actual editable `<textarea>`'s value — still the same real risk of a race with the user's own typing that got this skipped the first time. Not a time-cut corner; it doesn't make sense to force.
- **Pricing's annual toggle** — still skipped. There is still no real annual price anywhere in the data model or the Whop integration; fabricating one isn't something I'll do unilaterally.

---

## 2. Decisions I made on your behalf, and why

**Default flips to "Seeded," not "Legacy."** There's no schema-free way to tell "brand-new user" from "existing user who never touched the toggle," so the simplest honest reading of "default for new users" is: anyone who's never explicitly chosen now sees Seeded. This also means existing users who never touch the toggle will see Seeded once this ships, not just new signups — flagging that explicitly since it's a real behavior change.

**`main` was reset to `origin/main`.** I verified `revamp` contains every commit `main` had (branched from its tip before the reset) before moving the pointer — so nothing was lost, it all lives on `revamp`. `git branch -f main origin/main` was used rather than checking out `main` and resetting, so I never had to touch the working tree to do it.

**Component files were not moved into `components/legacy/*`.** Your spec suggested that as an example path; I kept Legacy components exactly where they already were (nothing in Legacy was touched by this work regardless) and built Seeded's siblings in a cleanly separated `components/seeded/*` tree instead. Functionally identical separation, far smaller diff — no import-path churn across the whole app for a purely organizational win. Say the word if you actually want the literal file move.

**Two depths of treatment, by priority.** The homepage, dashboard, roadmap, schools browser, school detail, and training calendar got full duplicate-layout forks (a real second composition, e.g. the roadmap's self-drawing line chart, the dashboard's progress ring, schools' 3D tilt cards). Everything after that — tournament fit, pricing, coach outreach, matches, match mode, cost calculator, friends, badges, family, settings, onboarding — got **inline conditional styling** within the existing component (same logic, same state, just Seeded classes applied via `isSeeded` ternaries) rather than a full duplicate layout. This was a deliberate pace/risk trade given the volume: lower engineering risk for complex interactive forms (coach email composer, match logging, cost inputs), faster to cover the full list. The visual result is still genuinely Seeded (glass panels, Geist/mono type, gradient accents) — just not a structurally different composition on those pages.

**Two specific "signature moments" from your brief were reinterpreted or skipped, each for a concrete reason:**
- **Schools "3D-tilted card wall"** → kept as a sortable data table (the actual UI pattern) with a real 3D cursor-tilt per row (`components/seeded/shared/tilt-card.tsx`). Forcing it into a literal card grid would have lost the at-a-glance column comparison that's the point of the page.
- **Pricing "animated toggle"** (implying monthly/annual) → still skipped, reconsidered in the finishing pass and left alone. There is no annual price anywhere in this app's data model or the Whop checkout integration. Inventing one would mean fabricating a number nothing backs, or checking a real customer out at a price that doesn't exist on the Whop side.

**Coach outreach "email types itself in" → still skipped, reconsidered in the finishing pass.** `buildCoachEmail` is synchronous with no real latency to mask, so the only way to make a typing effect real (not fake-delayed decoration) is animating directly into the editable `<textarea>`'s value — the same race-with-the-user's-own-typing risk that got this skipped originally.

**Badges "confetti burst" → done in the finishing pass.** Originally shipped as a scale-pop + glow halo; now upgraded to real particles (`components/seeded/shared/confetti-burst.tsx`), hand-rolled with framer-motion, no new dependency.

**Auth forms (login/signup/parent-login/parent-signup/reset-password) → done in the finishing pass.** Originally left untouched (not named in the brief, real account-creation/login flow, treated like "anything destructive" per your skip criteria even though restyling isn't actually destructive). Revisited because you asked for everything unfinished to be closed out before this went to production, and a real user hitting an unstyled auth page mid-flow is a genuine "looks unfinished" gap. Layout/visuals only — auth logic untouched.

**Onboarding was reconsidered and done, not skipped.** I'd initially planned to skip it alongside the auth forms, then realized it isn't actually blocked by your skip criteria (no payment, no schema change, nothing destructive) — just a bigger file. Went back and did it.

**Cross-device flash-of-wrong-design was explicitly not solved, and I left it alone in the finishing pass too.** Same-device is flash-free (the pre-paint script in `app/layout.tsx` reads localStorage before first paint, as it already did for themes). A signed-in user's *brand-new* device will show the fallback for one beat before snapping to their real saved preference. True zero-flash there needs cookie + middleware SSR resolution — you told me explicitly to skip this originally, and it's a deliberate scope decision, not a time-cut corner, so "finish everything" didn't reopen it.

**An uncommitted, unverified Codex change was stashed rather than shipped.** Found `lib/ga4-server.ts` (new) plus an edit to `app/api/whop/webhook/route.ts` sitting uncommitted in the working tree — real functionality (reports purchases to GA4 from the webhook) but never built or tested, and it touches real payment-granting logic. Stashed it (recoverable, not deleted), documented exact recovery steps in both `CLAUDE.md` and `AGENTS.md` under "Future tasks," and spun off a separate task chip for it. It never shipped in this push.

---

## 3. First Load JS — before vs after

The three routes you gave explicit budgets for:

| Route | Before | After | Δ | Budget |
|---|---|---|---|---|
| `/dashboard` | 243 kB | 245 kB | +2 kB | ~40 kB |
| `/roadmap` | 226 kB | 228 kB | +2 kB | ~40 kB |
| `/training` | 235 kB | 239 kB | +4 kB | ~40 kB |

Every other route, current state (most of these didn't have a meaningful "before" — either new routes like `/dev/design`, or the Seeded work added a few kB of conditional styling to an existing page):

| Route | First Load JS |
|---|---|
| `/` (homepage) | 230 kB |
| `/badges` | 215 kB |
| `/coaches` | 237 kB |
| `/contact` | 136 kB |
| `/cost-calculator` | 215 kB |
| `/dev/design` | 139 kB |
| `/family` | 215 kB |
| `/friends` | 214 kB |
| `/how-it-works` | 148 kB |
| `/login` | 173 kB |
| `/match-mode` | 216 kB |
| `/matches` | 215 kB |
| `/onboarding` | 207 kB |
| `/parent-login` | 173 kB |
| `/parent-signup` | 215 kB |
| `/parents` | 147 kB |
| `/pricing` | 215 kB |
| `/reset-password` | 172 kB |
| `/schools` | 162 kB |
| `/schools/[slug]` | 274 kB |
| `/settings` | 206 kB |
| `/signup` | 215 kB |
| `/terms` | 135 kB |
| `/tournament-fit` | 221 kB |
| Shared by all routes | 87.8 kB |

Full production build succeeds across all ~30 routes (104 pages including school-detail SSG pages).

---

## 4. Skipped, blocked, or left as TODO

- **Cross-device flash-of-wrong-design** — explicitly skipped per your original instruction (cookie/middleware SSR resolution not built). Reconsidered and left alone in the finishing pass too — this is a deliberate scope decision, not a time-cut corner.
- **Pricing's monthly/annual toggle** — skipped, no real annual price exists to toggle to. Reconsidered in the finishing pass, still no data to toggle to.
- **Coach outreach's "email types itself in"** — skipped, reconsidered in the finishing pass. It's a synchronous operation with no real latency to mask, so the only "real" version animates into the live editable textarea — same risk that got it skipped originally.
- **`components/legacy/*` file reorganization** — not done; Legacy stayed where it was instead. Purely organizational, zero effect on what ships, left alone to avoid regression risk right before this production push.
- **GA4 purchase-tracking in the Whop webhook** — found as an uncommitted Codex change, stashed rather than shipped unverified. See `CLAUDE.md`/`AGENTS.md` "Future tasks" for recovery steps.
- Several already-themed interior cards on larger pages (e.g. some of the "This week" check-in internals, a few deeper settings sub-sections) got the lighter inline-styling pass rather than a full bespoke redesign — they're correctly colored but not maximally reimagined. If any specific page feels thin, tell me which and I'll go deeper on it specifically.

Nothing was silently dropped — everything above was a judgment call made in the open, logged in its own commit message too.

---

## 5. Commits

**Tag**: `legacy-v1` at `385de3c` (the exact commit before any revamp work began — your permanent "go back to the original site" anchor).

**`main`**: merged (fast-forward — `revamp` had every commit `main` ever had, so no merge commit needed) to `revamp`'s tip and pushed to `origin/main`. This repo's Vercel project auto-deploys `main` to `seededtennis.com`, so this push is a production deploy.

**`revamp`** → merged into `main`, 19 commits since `legacy-v1`:

```
d6969fb Add Premium design system foundation + app shell + training-view redo
aa3554d Wire Premium design into the app shell (nav, sidebar, footer)
c7518b6 Rebuild landing page with a genuinely different Premium composition
a103f5d Step 0: rename Premium to Seeded, flip default, persist to profile
7dacab9 Chunk 2: /dev/design design system showcase page
cdfbf09 Chunk 3: Seeded versions of the remaining marketing pages
e42d9d6 Chunk 4: command palette for the Seeded app shell
c341771 Feature area: Dashboard — bento layout + glowing UTR progress ring
4f739c6 Feature area: Roadmap — self-drawing UTR line + hover-zoom timeline
310d735 Feature area: Schools browser — glass rows with real 3D tilt-on-hover
76a941a Feature area: School detail page — Seeded branch, school branding kept
2b7c585 Feature area: Tournament fit finder — inline Seeded styling
2972727 Feature area: Pricing — glowing recommended plan, count-up prices
86af734 Feature area: Coach outreach — glass composer, animated status chips
d1a6099 Feature areas: Match history + Match mode — inline Seeded styling
044ad2e Feature areas: Cost calculator, Friends, Badges, Family, Settings
e24fe2b Feature area: Onboarding — completes every named feature area
6a0a3cd Finish TODO: Seeded styling for auth pages
964ce02 Finish TODO: real confetti particles on badge unlock
```

Every commit passed `tsc --noEmit`, `eslint`, `vitest run` (57/57), and a full production `next build` before being made.

---

## 6. Top 5 things to check first — on the real, live site now

1. **Go look at seededtennis.com for real** — this is live now. Check `/dashboard`, `/roadmap`, and `/training` on your own account first — these are the three pages I could *not* verify live during the build (no credentials, by design — see your own CLAUDE.md note about local dev sharing the production Supabase project), so they're the highest-value thing for you to eyeball.
2. **Try the command palette** (Cmd/Ctrl+K) in the signed-in app shell — also unverified live, same reason.
3. **The new auth pages** — `/login`, `/signup`, `/parent-signup`, `/parent-login`, `/reset-password` — these are the biggest visual change in this last push and I verified them in the dev preview, not production; worth a quick look at the real deployed versions.
4. **The footer's "Switch to Legacy" link** — confirm it actually gets you back to the exact old site, and that your Legacy palette choice (if you had one) is still there.
5. **The stashed GA4/webhook change** — spin up the task chip whenever you want it finished, or tell Codex directly; it's fully documented in `CLAUDE.md`/`AGENTS.md` and recoverable with `git stash pop`.
