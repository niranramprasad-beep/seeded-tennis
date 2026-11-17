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
disposable ones set on staging first (see `docs/FINAL_PASS_REPORT.md`).

| script | what it does |
|---|---|
| `site-audit.mjs <pass>` | Every route enumerated from `app/` (school slugs from the build) × personas × widths × themes. Records status, final path, h1s, meta, small targets/text, horizontal scroll, CLS, LCP, axe, console errors, failed requests, a screenshot. Passes: `tier1`, `widths`, `browsers`, `extras` (legacy theme, reduced motion, 200% zoom). |
| `audit-summary.mjs <pass>` | Groups a pass's `results.jsonl` into findings by kind. |
| `flows.mjs` | End-to-end flows (signup → onboarding → report, family join/approve/consent, budget, export, delete account, checkout return states). |
| `keyboard-audit.mjs` | Tab order, visible focus, skip link, dialog focus traps. |
| `persona-walk.mjs` | Walks each persona and records every number the app shows about the same player, to catch screens that disagree. |
| `lighthouse-run.mjs` | Lighthouse (mobile) on every public route. Run with nothing else hitting the server. |
| `cls-sources.mjs <email> <route> [width]` | One page, one signed-in persona: every layout shift with the elements that moved and their before/after boxes. Use it when site-audit reports CLS > 0.05. |
| `ui-audit.mjs` | Older four-width screenshot/axe pass from the launch polish work. |

Scratch probes live in `scripts/_scratch/`, which is git-ignored locally.

`site-audit.mjs` takes `AUDIT_OUT` (absolute folder) and `AUDIT_PERSONAS`
(comma list, `polish` pass) so a before/after pair can sit side by side; the
`polish` pass is signed-out + persona a + persona f at 320/375/1440, light and
dark. `audit-summary.mjs` reads the same `AUDIT_OUT`. `persona-walk.mjs` takes
`WALK_OUT`, `lighthouse-run.mjs` takes `LH_OUT`.
