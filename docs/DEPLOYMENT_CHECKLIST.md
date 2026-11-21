# Seeded — Deployment Checklist

## Current setup (2026-11-20)
- GitHub `niranramprasad-beep/seeded-tennis` → Vercel project `seeded-tennis`.
- **`main` auto-deploys to seededtennis.com. There is no staging gate**, so
  the merge is gated by a person: only merge after CI passes and the owner
  says go.
- **`main` is protected:** a pull request and a green `verify` check are
  required.
- CI: `.github/workflows/ci.yml`, job `verify` (typecheck, lint, tests,
  time-zone tests, build) on pull requests to and pushes to `main`. No
  deploy step —
  Vercel's Git integration deploys.
- `vercel.json`: framework, install and build command only. No crons.
  Security headers are set in `next.config.mjs`.
- Uptime: `.github/workflows/uptime.yml` checks `/` and `/api/health` on
  production hourly (no secrets, not a required check, not part of
  `verify`). A failed run is reported only by GitHub's own Actions
  notification — see TECHNICAL_ARCHITECTURE "Monitoring".

## Environments
| Env | Supabase | Who deploys |
|---|---|---|
| Development (local) | staging `gnlcpnsweqbtwpaqhqqg` | dev |
| Preview (PR branches) | staging `gnlcpnsweqbtwpaqhqqg` | Vercel, automatic |
| Production (`main`) | production `tfpjssmhiptbwigarxpx` | merge with green CI + owner sign-off |

Not verified for this doc: whether Preview uses separate Whop test plans.
Diff env var **names** between Preview and Production before a billing
change.

## Before every production deploy
- [ ] CI green on the PR
- [ ] **Migrations first, code second.** Every migration the code depends on
      is applied to staging, verified as a real user, then applied to
      production with the owner's sign-off — before the merge. `/privacy`
      and `/terms` describe RLS; the tests behind those sentences read
      migration files and cannot see a database, so merging code ahead of
      its migration publishes a false privacy promise with a green build.
- [ ] Destructive DB change only after the code that stopped using it is live
- [ ] `get_advisors` (security + performance) reviewed on staging
- [ ] QA journeys (`docs/QA_CHECKLIST.md`) on the Preview URL
- [ ] Env var names diffed between Preview and Production
- [ ] Rollback target noted (previous production deployment ID) and, for a
      migration, a fresh production backup plus the written rollback
      (`docs/HANDOFF.md` §J)

## After every production deploy
- [ ] `curl -s https://seededtennis.com/api/health` answers 200 with
      `"ok":true`, `"database":"ok"`, and `"commit"` equal to the first 7
      characters of the merged commit. A 503 means the deployment cannot
      reach Supabase; a `commit` that does not match means Vercel is still
      serving the previous deployment.
- [ ] Vercel → the deployment → Logs: no new `"level":"error"` lines in the
      first few minutes (search `"level":"error"`).
- [ ] Optional: Actions → Uptime → "Run workflow" for an outside check.

## Rollback
1. Vercel → Deployments → previous production deployment → "Promote to
   Production" (instant; code only).
2. Database changes do **not** roll back with the code. Use the migration's
   written rollback from HANDOFF §J — rehearsed ones only.
3. Note the incident in `docs/CHANGELOG.md`.

## Environment variables
Names and purpose: `.env.example` (it does not yet list
`GA4_MEASUREMENT_PROTOCOL_API_SECRET`, which `lib/ga4-server.ts` reads).
`SUPABASE_SERVICE_ROLE_KEY`, `WHOP_*` and that GA4 secret are server-only; never prefix a secret
with `NEXT_PUBLIC_`. Keep values out of docs, logs and screenshots.

## Domains / SSL
`seededtennis.com` on Vercel (auto TLS). HSTS is set in `next.config.mjs`
(2 years, subdomains, no `preload`). Not re-verified for this doc: the
apex ↔ `www` redirect.

## History
The 2026-11-10 setup (no CI, previews on the production database, the
`coach_outreach.status` outage) and the one-off `v1` → `main` launch
checklist (maintenance page, sixteen migrations) are in this file's git
history; the launch itself is recorded in `docs/archive/PR-v1-to-main.md`.
