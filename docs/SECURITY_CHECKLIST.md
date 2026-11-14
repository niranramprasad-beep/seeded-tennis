# Seeded — Security Checklist

Audited 2026-11-10 against the code (`audit-base` = `c8d48ec`) and the live
Supabase project. "Confirmed live" = verified with SQL against the real
database, not inferred from migration files.

P0 = deployment blocker · P1 = fix before launch · P2 = soon · P3 = later

## Findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| S-1 | **P0** | Users can UPDATE their own `subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*` (column grants + no trigger, confirmed live). Paywall bypass incl. server-side `has_tier()`. | **Fixed on STAGING (022), tested. Still open on production.** 5/5 attack attempts blocked with `42501`; legitimate edits still work. |
| S-2 | **P0** | `families` SELECT policy is `true` for all authenticated users (confirmed live) + self-settable `family_code` + `parent_accounts` insert only checks `user_id` → any user can join any family and read a minor's profile/UTR/matches/outreach and write the budget. Codes are `NAME-XXXX` from `Math.random()`. | **Fixed on STAGING (023), tested. Still open on production.** Members-only `families` read; join goes through `join_family()`; a join is *pending* until a member approves; rate-limited to 5/hr; `generate_family_code()` uses `gen_random_bytes`. **Breaks `lib/auth.ts` — see docs/TODO.md item 1.** |
| S-3 | **P0** | Prod and dev share one Supabase project; prod code is already incompatible with live schema. | Open (P0-5/P0-6) |
| S-4 | P1 | `/api/training/copilot`: authed-only, no tier check, no rate limit, unbounded input, returns raw provider errors, model told to make changes on its own. | **Fixed (P1-SEC-1)** — route, component and action handlers deleted; `@google/genai` uninstalled. **Key still needs revoking at Google.** |
| S-5 | P1 | `profiles_discovery_read` exposes the full row (email, GPA, grade, family_code, stripe ids) of `privacy_level='public'` profiles to every signed-in user (1 live row). | Open |
| S-6 | P1 | No rate limiting on any route; Supabase leaked-password protection disabled (advisor). | Open |
| S-7 | P1 | No security headers (CSP, frame-ancestors, referrer, permissions). | Open |
| S-8 | P1 | Dead Stripe endpoints `/api/stripe/*` are live. | **Fixed (P1-SEC-5)** — routes and `lib/stripe.ts` deleted; `stripe` uninstalled. **The Stripe secret key still needs revoking in Stripe** (Niran, 2026-11-11). |
| S-9 | P1 | SECURITY DEFINER helpers callable via `/rest/v1/rpc/*` by `authenticated` (advisor). `is_family_member(code)` acts as a code-validity oracle until S-2 is fixed. | Open |
| S-10 | P2 | API routes return `err.message` from Supabase/Gemini to the client (schema/provider detail leakage). Return generic messages, log details server-side. | Open |
| S-11 | P2 | `/api/whop/checkout` builds `redirect_url` from the request `Origin` header. Whop restricts redirects to configured domains, but pin it to `NEXT_PUBLIC_SITE_URL` anyway. | Open |
| S-12 | P2 | Under-13 gate is client-only; birth year isn't stored. | Open (P0-8) |
| S-13 | P3 | `are_friends()`, `friendships`, `badges` are dead but present. | Open |
| S-15 | P1 | **Found 2026-11-14 on staging.** The first `join_family()` logged each attempt and then RAISED for an invalid code. Raising rolls the function's own work back to its savepoint — and under PostgREST each RPC is its own transaction — so the attempt row vanished with the exception and the rate limiter counted zero failures. Brute force was effectively unlimited. | **Fixed** — expected outcomes now RETURN a status so the attempt row commits; only auth and rate-limit raise. Retested: 5 logged, blocked at attempt 6. |
| S-16 | P1 | **Found 2026-11-14 on staging.** With 022+023 applied, an APPROVED parent could not read their child's data at all. The family-read policies keyed off `current_family_code()` — the reader's own `profiles.family_code` — and the only way a parent ever got that set was by writing it to their own profile, which is exactly the hole 022 closes. The legitimate path and the attack were the same mechanism. | **Fixed** — `utr_entries_select_family` and `family_members_read` now use `is_family_member()`, which requires an APPROVED link. Strictly safer than before. Retested: approved parent reads; pending link and unlinked stranger both read nothing. |
| S-14 | P1 | **Third-party harm, not self-harm:** the catalog shipped invented coach addresses at real university domains (`dwhitfield@stanford.edu`), prefilled as the outreach recipient. A minor clicking "Open in Gmail" would send a real message to a real domain's mail server, addressed to someone who doesn't exist, asserting invented facts about that program. Also exposed invented names, hometowns and UTRs of fictional "recent recruits" presented as real juniors. | **Fixed (P0-3)** — fields deleted from the type and all 68 entries; recipient is user-typed and validated; `schools-catalog-honesty.test.ts` fails the build on re-add |

## What's done well (keep it)
- Writes go through zod-validated routes with a request-scoped, RLS-respecting client (`lib/api-auth.ts`), not the service role.
- Whop webhook verifies signatures on raw bytes and guards against stale/out-of-order events.
- `anon` EXECUTE on SECURITY DEFINER helpers was properly revoked (migration 020 + two live-only fixes).
- No secrets in git (`git ls-files` shows only `.env.example`, `.env.local.example`).
- `/dev/*` previews call `notFound()` in production.
- RLS is enabled on all 23 public tables (confirmed live).

## Checklist before any launch
- [x] S-1 trigger applied on **staging**, attack-tested → **still to apply on prod** (HANDOFF §J step 2)
- [x] S-2 join flow via RPC, `families` members-only, applied on **staging**, attack-tested → **still to apply on prod** (HANDOFF §J step 3)
- [ ] `lib/auth.ts` updated to call `join_family()` — 023 breaks parent signup until this lands (TODO item 1)
- [ ] Stranger-account test: cannot read any other user's rows in any table (script in QA_CHECKLIST.md §RLS)
- [ ] Service-role key only in Production env on Vercel; never `NEXT_PUBLIC_*`
- [ ] Rate limits on `/api/*`, signup, login, password reset, family join
- [ ] Leaked password protection on; minimum password length ≥ 8
- [ ] Security headers deployed (CSP report-only first)
- [x] Copilot + Stripe routes removed (P1-SEC-1, P1-SEC-5)
- [ ] **Revoke the removed credentials at the provider**, not just in Vercel: the AI key at Google, the Stripe secret key in Stripe, and rotate the Whop key. Deleting an env var does not invalidate a credential — it stays live at the provider until revoked. Niran took all three on 2026-11-11; the var names are deliberately not listed here or in `.env.example` any more, because nothing in the codebase reads them.
- [ ] `get_advisors(security)` returns no ERROR and only accepted WARNs
- [ ] Dependency audit: `npm audit --omit=dev` reviewed

## Rules for future changes
- Never authorize in the client. A UI gate (`PaidGate`, `AuthGate`) is cosmetic; the RLS policy or route check is the real gate.
- Any new column on `profiles` that affects money, role, or family access must be added to the 022 trigger.
- After any REVOKE, verify with `has_function_privilege` / `information_schema.column_privileges` — Postgres grants to PUBLIC by default.
- Never use the service-role client for a user-initiated write.
- Treat every string from the client, the database, or an AI model as untrusted in prompts and in HTML.
- A function that logs an attempt and then RAISEs loses the log. Postgres rolls a
  PL/pgSQL block back to its savepoint on exception, and PostgREST wraps each RPC
  in its own transaction. If you are counting failures, RETURN a status for the
  expected failures — only raise for things you do not need to record (S-15).
- When you close a privilege-escalation hole, check what was *legitimately* using
  the same mechanism. In S-16 the parent-read feature and the parent-impersonation
  attack were the identical code path; fixing one silently broke the other, and
  only an end-to-end happy-path test caught it.
- Treat invented data as a security finding when it leaves the app: an address we made up is a message sent to a real third party, and a fabricated "fact" about a real institution is a statement a minor makes in their own name. Outbound recipients are always user-supplied and validated.
