# Seeded — Deployment Checklist

## Current setup (verified via Vercel MCP, 2026-11-10)
- Vercel project `seeded-tennis`, team `niranramprasad-3534s-projects`.
- Production = `main` @ `df8a2df` ("Remove the badges feature entirely…"). Auto-deploys on push. No staging gate.
- Preview deployments exist for `codex/identity-overhaul-orange-green-pink` (`c8d48ec`) and `macbook-backup`. They use the **production** Supabase project.
- `vercel.json`: framework + build command only. No crons, headers, or redirects.
- No CI. No runtime errors in the last 7 days (very low traffic).
- **Known production breakage:** `main` writes `coach_outreach.status='contacted'`; live DB CHECK rejects it (migration 011 applied for an unmerged branch). See MASTER_ROADMAP P0-5.

## Environments (target)
| Env | Supabase | Whop | Who deploys |
|---|---|---|---|
| Development (local) | staging project | test plans | dev |
| Preview (PR branches) | staging project | test plans | auto |
| Production (`main`) | prod project | live plans | merge with green CI + sign-off |

## Before every production deploy
- [ ] CI green (typecheck, lint, tests, build)
- [ ] Every migration in this deploy already applied + verified on staging
- [ ] Migration order decided: additive DB change first, code second; destructive DB change only after the code that stopped using it is live
- [ ] `get_advisors` security + performance reviewed on staging
- [ ] QA journeys 1–20 on the preview URL
- [ ] Env vars diffed (names only) between Preview and Production
- [ ] Rollback target noted (previous production deployment ID)

## Rollback
1. Vercel → Deployments → previous production deployment → "Promote to Production" (instant; code only).
2. Database changes do **not** roll back with the code. Every migration needs a written down-path or must be additive.
3. Note the incident in `docs/CHANGELOG.md`.

## Environment variables
See `.env.example` (names + purpose only). Rules: `SUPABASE_SERVICE_ROLE_KEY`, `WHOP_*`, `GA4_MEASUREMENT_PROTOCOL_API_SECRET` are Production/Preview server-only; never prefix secrets with `NEXT_PUBLIC_`.

## Domains / SSL
`seededtennis.com` on Vercel (auto TLS). Check the apex + `www` redirect and HSTS after adding security headers.
