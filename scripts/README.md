# scripts/

Audit harnesses kept from the 2026-11-16 overnight pass. None of them run in
CI; they drive a **production build** (`next build && next start -p 3100`)
pointed at **staging**, never production. They need `playwright-core`
browsers (`npx playwright-core install chromium webkit`; Firefox was
installed into its own `PLAYWRIGHT_BROWSERS_PATH` because the installer kept
evicting WebKit) and write evidence to `~/seeded-evidence/overnight/`, never
into the repo.

Signed-in passes read the persona password from
`~/seeded-evidence/overnight/.persona-pass`. The persona passwords are
scrambled at the end of every pass, so a signed-in run needs fresh
disposable ones set on staging first (see `docs/archive/FINAL_PASS_REPORT.md`).

**Every script targets a local build (`localhost`) whose `.env.local` points
at staging, and signs in only as disposable staging personas. None of them
is ever pointed at production with a real account.** The one exception to
"local" is `perf-lighthouse.mjs`, which may be pointed at the public site
signed-out (no account, read-only page loads). Run each from the repo root
with plain `node`; none is wired into `package.json` or CI.

| script | what it does | how to run · target |
|---|---|---|
| `site-audit.mjs <pass>` | Every route enumerated from `app/` (school slugs from the build) × personas × widths × themes. Records status, final path, h1s, meta, small targets/text, horizontal scroll, CLS, LCP, axe, console errors, failed requests, a screenshot. Passes: `tier1`, `widths`, `browsers`, `extras` (OS-sync dark, reduced motion, 200% zoom), `narrow` (every route at 320 and 375; also records taps under 44px and content left under the fixed phone tab bar, which audit-summary reports for phone widths). | `node scripts/site-audit.mjs tier1` · `AUDIT_BASE`, default `localhost:3100`; staging personas |
| `audit-summary.mjs <pass>` | Groups a pass's `results.jsonl` into findings by kind. | `node scripts/audit-summary.mjs tier1` · reads local files only, no server |
| `flows.mjs` | End-to-end flows (signup → onboarding → report, family join/approve/consent, budget, export, delete account, checkout return states). | `node scripts/flows.mjs` · `AUDIT_BASE`, default `localhost:3100`; writes to staging as disposable personas |
| `keyboard-audit.mjs` | Tab order, visible focus, skip link, dialog focus traps. | `node scripts/keyboard-audit.mjs` · `AUDIT_BASE`, default `localhost:3100`; staging personas |
| `persona-walk.mjs` | Walks each persona and records every number the app shows about the same player, to catch screens that disagree. | `node scripts/persona-walk.mjs` · `AUDIT_BASE`, default `localhost:3100`; staging personas |
| `lighthouse-run.mjs` | Lighthouse (mobile) on every public route. Run with nothing else hitting the server. | `node scripts/lighthouse-run.mjs` · `AUDIT_BASE`, default `localhost:3100`; signed out |
| `sweep-c.mjs [C1 C9 …]` | PR C's production sweep, C1–C30, as the sweep persona against a production build on :3500 (`SWEEP_BASE` overrides). One concrete assertion per item (DOM text, counts, writes that land, no native dialogs anywhere, no sideways scroll, labels, two-decimal ratings), browser in America/New_York, evidence shots at 1440 and 375. Writes `~/seeded-evidence/production-sweep-1/SWEEP.md` (`SWEEP_OUT` overrides the file name) and folds in the C29 phone-sweep counts from `phone-before/` and `phone/`. Writes to staging as the persona — the header lists every row. | `node scripts/sweep-c.mjs C1 C9` · local production build on `localhost:3500`; writes to staging as the sweep persona |
| `cls-sources.mjs <email> <route> [width]` | One page, one signed-in persona: every layout shift with the elements that moved and their before/after boxes. Use it when site-audit reports CLS > 0.05. | `node scripts/cls-sources.mjs <persona-email> /today 375` · `CLS_BASE`, default `localhost:3100`; staging persona |
| `ui-audit.mjs` | Older four-width screenshot/axe pass from the launch polish work. | `node scripts/ui-audit.mjs` · `AUDIT_BASE`, default `localhost:3101`; signed out |
| `perf-lighthouse.mjs [routes…]` | D8 perf audit: Lighthouse mobile, N runs per route (`PERF_RUNS`, default 3), median TTFB/FCP/LCP/SI/TBT/CLS plus font files and JS KB, as a markdown table. `PERF_BASE` (default :3100), `PERF_OUT`, `PERF_INSECURE=1` for the h2 proxy. See docs/perf/audit-2-perf.md. | `node scripts/perf-lighthouse.mjs / /pricing` · `PERF_BASE`, default `localhost:3100`; signed out (the only script that may point at the public site) |
| `perf-h2-proxy.mjs <listen> <upstream>` | HTTP/2 + brotli in front of `next start`, so local Lighthouse numbers are comparable with production's (Vercel). | first a throwaway cert: `openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj "/CN=localhost"`, then `H2_KEY=key.pem H2_CERT=cert.pem node scripts/perf-h2-proxy.mjs 4100 3100` · local only, proxies `localhost:<upstream>`; `*.pem` is git-ignored |
| `perf-signed-in.mjs [routes…]` | Signed-in time until real content (no skeleton/spinner, held 300 ms) on the app routes, desktop, plus how many `/auth/v1/user` and REST calls ran first. `PERF_EMAIL` + `PERF_PASS_FILE` (a mode-600 file; never printed), `PERF_LATENCY` adds per-request latency. Staging only. | `PERF_EMAIL=… PERF_PASS_FILE=… node scripts/perf-signed-in.mjs /today` · `PERF_BASE`, default `localhost:3100`; staging persona only |

Scratch probes live in `scripts/_scratch/`, which is git-ignored locally.

`site-audit.mjs` takes `AUDIT_OUT` (absolute folder) and `AUDIT_PERSONAS`
(comma list, `polish` pass) so a before/after pair can sit side by side; the
`polish` pass is signed-out + persona a + persona f at 320/375/1440, light and
dark. `audit-summary.mjs` reads the same `AUDIT_OUT`. `persona-walk.mjs` takes
`WALK_OUT`, `lighthouse-run.mjs` takes `LH_OUT`.
