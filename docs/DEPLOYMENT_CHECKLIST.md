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
- [ ] **`/privacy` and `/terms` are only true AFTER the migrations.** Several
      sentences on those pages describe RLS that does not exist on production
      until §J has run — "there is no public profile, no directory, no search
      for other players" is the sharpest one, because production still has
      `profiles_discovery_read` and one account with
      `privacy_level = 'public'`. The tests behind those sentences grep
      migration FILES; they cannot see a database, and `lib/legal/policy.test.ts`
      now says so in as many words. **So this is a human gate: never merge the
      code before the migrations, or the site publishes a false privacy
      promise with a green build behind it.**
- [ ] Every migration in this deploy already applied + verified on staging
- [ ] **For the `v1` → `main` merge specifically:** all sixteen migrations
      applied first (full order in HANDOFF §J), and the maintenance page gone
      — **not by reverting the commit on `main`.** `d059006` is not an
      ancestor of `v1`, so there is nothing to revert, and the plain merge
      keeps `middleware.ts`: the deploy reports READY and the site still
      answers 503. Done on `v1` instead (merge `main` in, delete the file in
      its own commit), so by the time you read this the only thing to check
      is that `middleware.ts` is absent from the merge result. `024` is the
      coupled migration — the outreach tier gate and the Free 3-school cap
      are already in the `v1` code, so merging without it gives Player users
      an outreach board that fails every write.
- [ ] Migration order decided: additive DB change first, code second; destructive DB change only after the code that stopped using it is live
- [ ] `get_advisors` security + performance reviewed on staging
- [ ] QA journeys 1–20 on the preview URL
- [ ] Env vars diffed (names only) between Preview and Production
- [ ] Rollback target noted (previous production deployment ID)

## Branch protection (one-time GitHub setting — P1-OPS-1)
`.github/workflows/ci.yml` runs typecheck, lint, tests and build, but a
workflow only *reports*; it blocks nothing by itself. To make it a gate:

Settings → Branches → Add branch ruleset / rule for `main`:
- [ ] Require a pull request before merging
- [ ] Require status checks to pass → select **`verify`**
- [ ] Require branches to be up to date before merging
- [ ] (optional) Do not allow bypassing the above settings

Note: the maintenance-mode commit was pushed directly to `main` before this
rule exists. Once the rule is on, direct pushes to `main` stop working — which
is the point, but it means the `v1` merge must go through a PR.

## Rollback
1. Vercel → Deployments → previous production deployment → "Promote to Production" (instant; code only).
2. Database changes do **not** roll back with the code. Every migration needs a written down-path or must be additive.
3. Note the incident in `docs/CHANGELOG.md`.

## Environment variables
See `.env.example` (names + purpose only). Rules: `SUPABASE_SERVICE_ROLE_KEY`, `WHOP_*`, `GA4_MEASUREMENT_PROTOCOL_API_SECRET` are Production/Preview server-only; never prefix secrets with `NEXT_PUBLIC_`.

## Domains / SSL
`seededtennis.com` on Vercel (auto TLS). Check the apex + `www` redirect and HSTS after adding security headers.
