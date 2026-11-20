# Performance audit 2 (PR D, item D8) — 2026-11-19

The complaint: every signed-in app page showed a blank skeleton for 4–6 s on
production. Target: signed-in content visible in under 2 s on desktop
broadband; public LCP under 2.5 s on Lighthouse's simulated mobile.

**Result:** the signed-in skeleton wait is cut by half or more at every
latency measured, and is under 2 s on every route, even with 150 ms added to
every request. Public LCP fell by 0.6–2.7 s on every route. It is under
2.5 s on `/onboarding` only. The other public routes are at 2.7–3.3 s, still
over target. The cause of that remaining gap is identified below and is not
fixed in this PR.

## Method

All numbers are medians. Scripts are committed, so the whole audit can be
re-run.

| What | How |
|---|---|
| Production, signed out | `PERF_BASE=https://seededtennis.com node scripts/perf-lighthouse.mjs`. Lighthouse 12, mobile, default simulated slow 4G + 4× CPU, 3 runs per route, median. |
| Local, signed out, before vs after | The same script against two production builds served side by side: **before** = `0fa1b10` (a `git archive` copy), **after** = this branch. Both run behind `scripts/perf-h2-proxy.mjs` (HTTP/2 + brotli). That proxy is what makes local numbers comparable with Vercel's. `next start` on its own speaks HTTP/1.1 with gzip, and Lighthouse's simulation charges ~25 chunks over six HTTP/1.1 connections heavily. Through the proxy the unchanged build gives 3.5–3.9 s on public routes; production itself gives 2.7–3.6 s. Without the proxy it gives 5.3–6.2 s. 5 runs per route. |
| Signed in | `scripts/perf-signed-in.mjs` signs in through `/login` against a local production build whose `.env.local` points at **staging** (`gnlcpnsweqbtwpaqhqqg`; checked first: 1 staging ref, 0 production refs, service-role line commented out; built client chunks contain only the staging ref). Persona `fake-pb3-player@example.com`: Family tier, UTR history, onboarded. Desktop 1440×900, fresh browser context per run, 5 runs. "Content visible" = the first frame where `<main>` has a visible `<h1>`, no visible `.animate-pulse` skeleton, nothing `aria-busy`, and no AuthGate/PaidGate spinner, **and that stays true for 300 ms**. Supabase is ~16 ms from the measuring machine, so the script also adds latency to every request with CDP (`PERF_LATENCY`, 40 Mbps down). 100–150 ms is what a family on home wifi far from the project's region actually sees. |

The persona's password was set on staging for the run, kept in a mode-600
file outside the repo, and scrambled back to a non-bcrypt string afterwards.
The file was deleted. The 12 auth sessions the runs created were deleted from
`auth.sessions`.

## Causes found

1. **The session check ran as a serial chain of auth round trips (the
   skeleton).** `getAuthedUser()` called `supabase.auth.getUser()`, which is a
   network round trip to Supabase Auth. supabase-js runs it while holding its
   auth lock, and every REST query takes that same lock to read the access
   token. Every data loader called `getAuthedUser()` on its own:
   `getSessionState()` called it twice (once directly, once through
   `getCurrentPlayer()`), TierProvider once, and each `lib/db/*` loader once
   more. One signed-in `/today` load made **10 `/auth/v1/user` calls, strictly
   one after another**, and every table query waited behind them. The waterfall
   was getUser → getUser → profile → getUser (tier) → profile → page mounts →
   getUser × 6 → data. PaidGate pages (`/plan`, `/events`) also waited for the
   tier read before their children could even start loading.
2. **Twelve font files were preloaded on every page.** next/font preloads every
   file of every family declared in the root layout. With six families
   (Cormorant alone has six files) that was 12 `<link rel=preload>` files,
   313 KB, all at high priority ahead of the page's JS. Three of the families
   are used only by the opt-in Legacy concept themes, and Cormorant's 400
   italic is used for one accent word on a handful of pages. On simulated
   slow 4G this was the biggest single part of the gap between FCP (~0.9 s)
   and LCP.
3. **Signed-out visits to app routes waited for React to redirect them.**
   `/today` and the other app routes sent a visitor with no session to
   `/login` from AuthGate. That meant waiting for the page's JS, hydration and
   the session check, then fetching `/login`'s chunks. Lighthouse LCP was
   6.0 s on production.
4. **Analytics was preloaded.** `next/script` with `afterInteractive`
   emitted `<link rel=preload>` for the ~180 KB `gtag.js` at the top of every
   document.
5. **Not causes:**
   - TTFB is 11–15 ms on production. Every app route is static (`○`) and
     served from the CDN.
   - The school catalog is already static: prerendered at build time and
     never recomputed per request. It reaches the client as ~4 KB compressed,
     through the sidebar's badge count. Nothing to cache.
   - CLS is 0 everywhere, before and after.
6. **What still holds public LCP above 2.5 s: JavaScript.** About 285 KB
   (brotli) of JS is requested before first paint on every page. Lighthouse's
   simulated LCP counts every request that started before the paint, so all of
   it is charged. The two largest app-owned pieces are supabase-js (44 KB
   brotli, including the unused Realtime client) and framer-motion (36 KB).
   Both are in the shared bundle of every public page, through `Providers`.

## Before / after

### Signed in: time until real content (desktop, staging, local production build)

| Route | +0 ms before | +0 ms after | +100 ms before | +100 ms after | +150 ms before | +150 ms after | `/auth/v1/user` calls before content (before → after) |
|---|---|---|---|---|---|---|---|
| /today | 1389 ms | **439 ms** | 2367 ms | **1138 ms** | 3400 ms | **1606 ms** | 10 → 1 |
| /plan | 912 ms | **261 ms** | 1876 ms | **996 ms** | 2609 ms | **1391 ms** | 6 → 1 |
| /events | 955 ms | **405 ms** | 2299 ms | **1200 ms** | 3271 ms | **1615 ms** | 8 → 1 |
| /schools/stanford-m | 589 ms | **343 ms** | 1792 ms | **1147 ms** | 2439 ms | **1619 ms** | 5–6 → 1 |
| /schools | 40 ms | 49 ms | 499 ms | **280 ms** | 650 ms | **391 ms** | 0–1 → 0–1 |

(+150 ms is 3 runs per cell; the other columns are 5. `/schools` renders its
list from the static catalog and does not wait on a session, which is why it
was already fast.)

The difference grows with latency. Before, the wait was roughly a dozen round
trips in series. After, it is about three: one getUser in parallel with the
profile read, then the page's queries in parallel. This is the
production-sized version of the complaint: at real-world latency, 4–6 s of
serial auth calls on a slower machine becomes about 1.5 s.

### Signed out: Lighthouse mobile (simulated slow 4G)

| Route | Lands on | Production LCP (before, 3 runs) | Local LCP before (h2 proxy) | Local LCP after (h2 proxy) | Perf score before → after (local) | Font files before → after |
|---|---|---|---|---|---|---|
| / | / | 3616 ms | 3455 ms | **2854 ms** | 91 → 96 | 12 (311 KB) → 3 (131 KB) |
| /pricing | /pricing | 2727 ms | 3605 ms | **2854 ms** | 90 → 96 | 12 → 3 |
| /onboarding | /onboarding | 3318 ms | 3904 ms | **1954 ms** | 88 → 98 | 12 → 3 |
| /today (signed out) | /login | 6021 ms | 5705 ms | **3004 ms** | 79 → 94 | 12 → 3 (+3 cache hits) |
| /plan (signed out) | /login | 6022 ms | 5704 ms | **3006 ms** | 79 → 94 | 12 → 3 (+3) |
| /events (signed out) | /login | 6021 ms | 5704 ms | **3303 ms** | 79 → 92 | 12 → 3 (+3) |
| /schools | /schools | 2870 ms | 3754 ms | **2704 ms** | 89 → 96 | 12 → 3 |
| /schools/stanford-m | /schools/stanford-m | 2876 ms | 3754 ms | **2854 ms** | 89 → 96 | 12 → 3 |

FCP is unchanged at ~0.9 s on all routes. TTFB on production is 11–15 ms.
TBT is ≤ 64 ms and CLS is 0 throughout. Raw tables:
`perf-lighthouse.mjs` output, kept with the run JSON outside the repo.

**Not yet measured on production.** The "after" column is local through the
proxy, because nothing here has been deployed. Re-run
`PERF_BASE=https://seededtennis.com node scripts/perf-lighthouse.mjs` after
this merges, and check Vercel Speed Insights field data. Lab LCP is a
simulation, and the real first paint is the ~0.9 s FCP.

## What changed

| Change | File |
|---|---|
| `getAuthedUser()` shares **one** server-validated `getUser()` per access token among all callers, in flight or resolved. It is keyed on the token, so a refresh or a different user re-checks. It is cleared on SIGNED_IN, SIGNED_OUT and USER_UPDATED. Failures are never remembered, and entries expire after 60 s. Auth semantics are unchanged: the first caller still gets a real server check, and RLS is still the control. | `lib/supabase/client.ts`, test `lib/supabase/authed-user-memo.test.ts` |
| `getSessionState()` starts the caller's own profile read keyed by the **locally stored** session's user id, in parallel with the server check. The row is used only if the server confirms that same id; otherwise it is re-read for the verified user. It is still a single-row read by `id`. | `lib/auth.ts` |
| The tier from that profile row is handed to TierProvider (`takeRestoredTier`, consumed once, 15 s), so PaidGate pages don't wait for a second profile read. It is never put on `Player`, so it can't be round-tripped into a profile write. `refresh()` after checkout always reads the database. | `lib/auth.ts`, `lib/context/tier-context.tsx` |
| Fonts: only Inter, Inter Tight and JetBrains Mono are preloaded. Cormorant, Space Grotesk and IBM Plex Mono are `preload: false`: still declared, and fetched only when something renders in them. The visual design is unchanged. Tried also not preloading JetBrains Mono: it was still fetched before first paint and FCP got ~150 ms worse, so it stays preloaded. | `app/layout.tsx` |
| Head script: a browser holding **no** saved Supabase session that opens a signed-in-only route goes to `/login` before any bundle loads. That is the same destination AuthGate picks (checked for all 13 prefixes, query strings included). A browser with a saved session is never redirected by it. The prefix list moved to one place, `SIGNED_IN_ONLY_PREFIXES`, which AppShell also reads. | `app/layout.tsx`, `lib/route-access.ts`, `components/layout/app-shell.tsx`, test `lib/head-script-redirect.test.ts` |
| `gtag.js` loads `lazyOnload` instead of being preloaded. The inline snippet still defines `gtag()` early, so page views are queued, not lost. | `components/shared/google-analytics.tsx` |
| Tried and reverted: code-splitting the signed-in sidebar, ⌘K palette and Legacy headers out of AppShell. First-load JS did not change, because their dependencies are already in the shared bundle through the providers. | — |

## D7 items in the same PR

| Item | Change | Verified |
|---|---|---|
| No layout shift when a drawer/dialog opens | `scrollbar-gutter: stable` on `<html>`. `useDialog()`'s scroll lock sets only `overflow: hidden`, with no compensating padding, and every dialog/drawer goes through it. | Full Chromium with classic 10 px scrollbars, ⌘K on `/today` at 1440: before, the `<h1>` moved 289 → 294 px when the palette opened. After, it stays at 289. `body` padding-right is 0 in both. |
| The check-in streak counts yesterday | `calculateStreak()` starts from yesterday when today isn't logged yet, so a streak breaks only after a whole missed day. `now` is injectable. | `lib/db/plan.test.ts`: 00:01 and 23:59 local, the day after a miss, and a 42-day run across both US (Mar 8) and Auckland (Apr 5) DST changes. Passes under default, `America/New_York` and `Pacific/Auckland`. |
| `/sample-report` logo ≥ 44 px tap target | `inline-flex min-h-11 items-center` on the logo link. The CTA beside it was already 44 px, so the header height is unchanged. | At 375 px the link box is 28 → 44 px tall. |

## Next, if public LCP must be under 2.5 s

1. Load supabase-js only when it is needed. Today it is a static import of
   `lib/supabase/client.ts` from every provider, which puts 44 KB in front of
   first paint on every public page. The head script already knows whether a
   session exists, so a signed-out visitor needs none of it to render.
   `getSupabase()` would become async, which touches ~20 call sites.
2. Use `LazyMotion` + `m` for framer-motion (~36 KB → ~5 KB initial). This
   touches every `motion.*` component.
3. Re-measure on production first. The local proxy is close to production but
   not identical.
