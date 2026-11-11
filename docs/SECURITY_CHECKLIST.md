# Seeded — Security Checklist

Audited 2026-11-10 against the code (`audit-base` = `c8d48ec`) and the live
Supabase project. "Confirmed live" = verified with SQL against the real
database, not inferred from migration files.

P0 = deployment blocker · P1 = fix before launch · P2 = soon · P3 = later

## Findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| S-1 | **P0** | Users can UPDATE their own `subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*` (column grants + no trigger, confirmed live). Paywall bypass incl. server-side `has_tier()`. `/api/profile` also accepts `role`/`family_code` in its body. | Fix written: `supabase/migrations/022_…sql` (not applied) |
| S-2 | **P0** | `families` SELECT policy is `true` for all authenticated users (confirmed live) + self-settable `family_code` + `parent_accounts` insert only checks `user_id` → any user can join any family and read a minor's profile/UTR/matches/outreach and write the budget. Codes are `NAME-XXXX` from `Math.random()`. | Open (P0-2) |
| S-3 | **P0** | Prod and dev share one Supabase project; prod code is already incompatible with live schema. | Open (P0-5/P0-6) |
| S-4 | P1 | `/api/training/copilot`: authed-only, no tier check, no rate limit, unbounded input, returns raw provider errors, model told to make changes on its own. | Open |
| S-5 | P1 | `profiles_discovery_read` exposes the full row (email, GPA, grade, family_code, stripe ids) of `privacy_level='public'` profiles to every signed-in user (1 live row). | Open |
| S-6 | P1 | No rate limiting on any route; Supabase leaked-password protection disabled (advisor). | Open |
| S-7 | P1 | No security headers (CSP, frame-ancestors, referrer, permissions). | Open |
| S-8 | P1 | Dead Stripe endpoints `/api/stripe/*` are live. | Open |
| S-9 | P1 | SECURITY DEFINER helpers callable via `/rest/v1/rpc/*` by `authenticated` (advisor). `is_family_member(code)` acts as a code-validity oracle until S-2 is fixed. | Open |
| S-10 | P2 | API routes return `err.message` from Supabase/Gemini to the client (schema/provider detail leakage). Return generic messages, log details server-side. | Open |
| S-11 | P2 | `/api/whop/checkout` builds `redirect_url` from the request `Origin` header. Whop restricts redirects to configured domains, but pin it to `NEXT_PUBLIC_SITE_URL` anyway. | Open |
| S-12 | P2 | Under-13 gate is client-only; birth year isn't stored. | Open (P0-8) |
| S-13 | P3 | `are_friends()`, `friendships`, `badges` are dead but present. | Open |

## What's done well (keep it)
- Writes go through zod-validated routes with a request-scoped, RLS-respecting client (`lib/api-auth.ts`), not the service role.
- Whop webhook verifies signatures on raw bytes and guards against stale/out-of-order events.
- `anon` EXECUTE on SECURITY DEFINER helpers was properly revoked (migration 020 + two live-only fixes).
- No secrets in git (`git ls-files` shows only `.env.example`, `.env.local.example`).
- `/dev/*` previews call `notFound()` in production.
- RLS is enabled on all 23 public tables (confirmed live).

## Checklist before any launch
- [ ] S-1 trigger applied on staging → tests pass → applied on prod
- [ ] S-2 join flow via RPC; `families` readable only by members
- [ ] Stranger-account test: cannot read any other user's rows in any table (script in QA_CHECKLIST.md §RLS)
- [ ] Service-role key only in Production env on Vercel; never `NEXT_PUBLIC_*`
- [ ] Rate limits on `/api/*`, signup, login, password reset, family join
- [ ] Leaked password protection on; minimum password length ≥ 8
- [ ] Security headers deployed (CSP report-only first)
- [ ] Copilot + Stripe routes removed
- [ ] `get_advisors(security)` returns no ERROR and only accepted WARNs
- [ ] Dependency audit: `npm audit --omit=dev` reviewed

## Rules for future changes
- Never authorize in the client. A UI gate (`PaidGate`, `AuthGate`) is cosmetic; the RLS policy or route check is the real gate.
- Any new column on `profiles` that affects money, role, or family access must be added to the 022 trigger.
- After any REVOKE, verify with `has_function_privilege` / `information_schema.column_privileges` — Postgres grants to PUBLIC by default.
- Never use the service-role client for a user-initiated write.
- Treat every string from the client, the database, or an AI model as untrusted in prompts and in HTML.
