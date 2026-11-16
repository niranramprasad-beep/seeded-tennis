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
| S-5 | P1 | `profiles_discovery_read` exposes the full row (email, GPA, grade, family_code, stripe ids) of `privacy_level='public'` profiles to every signed-in user (1 live row). | **Fixed on STAGING (027), tested. Still open on production.** Policy dropped outright: V1 has no public-profile surface, so the rule is now "your own row, plus a family that has approved you". `badges`/`friendships` locked in the same pass (same leak, one table over). Stranger sees 1 row (their own); approved parent still reads the child, the family and the UTR history. |
| S-6 | P1 | No rate limiting on any route; Supabase leaked-password protection disabled (advisor). | **Partly fixed on STAGING (028), tested.** Every write route now consumes a Postgres-backed, per-user, per-bucket hourly limit and returns a friendly 429 with `Retry-After`; the limiter fails CLOSED. **Login, signup and password reset are NOT covered and cannot be from app code** — the browser calls Supabase Auth directly, so no Seeded route or middleware is on that path. Those need Supabase's own per-IP limits and leaked-password protection, both project settings (Niran). |
| S-7 | P1 | No security headers (CSP, frame-ancestors, referrer, permissions). | **Fixed on `v1`, verified against a production build.** `next.config.mjs` sets CSP, HSTS (2 years, subdomains, no `preload` — that is an owner's decision), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. Verified with `next build && next start`: all headers present, zero CSP violations across `/`, `/onboarding`, `/signup`, `/parent-signup`. **Partial, deliberately:** `script-src` keeps `'unsafe-inline'` because removing it needs per-request nonces, which need middleware, and `main`'s middleware is currently the maintenance page. It still blocks every off-origin script host. Nonce upgrade = P2. |
| S-8 | P1 | Dead Stripe endpoints `/api/stripe/*` are live. | **Fixed (P1-SEC-5)** — routes and `lib/stripe.ts` deleted; `stripe` uninstalled. **The Stripe secret key still needs revoking in Stripe** (Niran, 2026-11-11). |
| S-9 | P1 | SECURITY DEFINER helpers callable via `/rest/v1/rpc/*` by `authenticated` (advisor). `is_family_member(code)` acts as a code-validity oracle until S-2 is fixed. | **Reviewed and partly fixed on STAGING (027).** `are_friends()` dropped; `current_family_code()` and `generate_family_code()` revoked from `authenticated`. The remaining 17 are each justified in the inventory below — **and the four used inside RLS policies CANNOT be revoked**: Postgres checks EXECUTE on a policy's functions against the querying role, so revoking fails the policy closed. Tested, not assumed (see 027's header). The oracle concern is retired: 023 made a valid code worthless without approval and rate-limited guessing to 5/hour. |
| S-10 | P2 | API routes return `err.message` from Supabase/Gemini to the client (schema/provider detail leakage). Return generic messages, log details server-side. | Open |
| S-11 | P2 | `/api/whop/checkout` builds `redirect_url` from the request `Origin` header. Whop restricts redirects to configured domains, but pin it to `NEXT_PUBLIC_SITE_URL` anyway. | **Fixed on `v1` (2026-11-15 overnight).** Production returns to `https://seededtennis.com`; a Vercel preview to its own `https://$VERCEL_URL`; never a request header. A Whop error is now caught and returned as a 502 with a sentence instead of an empty 500. |
| S-12 | P2 | Under-13 gate is client-only; birth year isn't stored. | **Fixed on STAGING (030 + 031), tested.** Birth year is stored; `consent_status` is derived by the trigger from it and never accepted from the request body; `birth_year` is write-once from the client (the bypass: edit your birth year, get re-derived as `not_required`); a `pending` account reads and writes nothing but its own profile row via RESTRICTIVE policies on 21 tables. 24/24 on the attack + happy-path suite. **No verification of adulthood exists or is claimed** — the consent copy says so. |
| S-13 | P3 | `are_friends()`, `friendships`, `badges` are dead but present. | Open |
| S-15 | P1 | **Found 2026-11-14 on staging.** The first `join_family()` logged each attempt and then RAISED for an invalid code. Raising rolls the function's own work back to its savepoint — and under PostgREST each RPC is its own transaction — so the attempt row vanished with the exception and the rate limiter counted zero failures. Brute force was effectively unlimited. | **Fixed** — expected outcomes now RETURN a status so the attempt row commits; only auth and rate-limit raise. Retested: 5 logged, blocked at attempt 6. |
| S-16 | P1 | **Found 2026-11-14 on staging.** With 022+023 applied, an APPROVED parent could not read their child's data at all. The family-read policies keyed off `current_family_code()` — the reader's own `profiles.family_code` — and the only way a parent ever got that set was by writing it to their own profile, which is exactly the hole 022 closes. The legitimate path and the attack were the same mechanism. | **Fixed** — `utr_entries_select_family` and `family_members_read` now use `is_family_member()`, which requires an APPROVED link. Strictly safer than before. Retested: approved parent reads; pending link and unlinked stranger both read nothing. |
| S-14 | P1 | **Third-party harm, not self-harm:** the catalog shipped invented coach addresses at real university domains (`dwhitfield@stanford.edu`), prefilled as the outreach recipient. A minor clicking "Open in Gmail" would send a real message to a real domain's mail server, addressed to someone who doesn't exist, asserting invented facts about that program. Also exposed invented names, hometowns and UTRs of fictional "recent recruits" presented as real juniors. | **Fixed (P0-3)** — fields deleted from the type and all 68 entries; recipient is user-typed and validated; `schools-catalog-honesty.test.ts` fails the build on re-add |

| S-17 | **CRITICAL** | **Found 2026-11-15 by an independent review.** 022 locks `family_code` on UPDATE but its INSERT branch leaves it alone, and `profiles_insert_own` only checks `id = auth.uid()`. Since `is_family_member()` reads `profiles.family_code` directly, any signed-up account with no profile row yet could INSERT one carrying **someone else's family code and `role='parent'`** and become an approved member in one statement — the minor's name, email, birth year, GPA, UTR and full history; every member's email and `consent_status` including an under-13 sibling's; parent-level **write** on the season budget. **The whole 023/026 pending-approval design was bypassed.** The only thing holding the door was `lib/auth.ts` choosing not to do it — and a comment in that file asserted the database would reject it, which it would not. | **Fixed on STAGING (032), attack-tested twice** (once by the reviewer, once by me). A `family_code` on INSERT is allowed only when no profile and no `parent_accounts` row already holds it. Create / join / update all verified unaffected. |
| S-18 | P1 | **Found 2026-11-15.** The under-13 gate is skipped by *omitting* `birth_year`: `consent_required_for_birth_year(null)` is false, so the row lands `not_required` and `account_active()` is true — and all 21 of 030's restrictive policies hang off `account_active()`. | **Not fixed — deliberate.** Requiring `birth_year` at the DB layer would break signup entirely if any path forgets to send it, which is a worse failure than the one it prevents. It is also the inherent limit of self-declared age: a child who lies defeats any such gate, which is why the privacy policy says we cannot verify. **A product and legal call, belonging with P0-8.** Recommended: make it NOT NULL for new rows once every signup path is confirmed to send it. |
| S-19 | P2 | **Found 2026-11-15.** `findProfileIdByEmail` passed a **Whop-supplied** email to PostgREST `.ilike()` as a *pattern*, so `%` and `_` were wildcards. A membership bought as `%@gmail.com` would attach a paid tier to a stranger's account, and the `limit(2)` ambiguity check does not catch it — a pattern matching exactly one row looks like a clean match. | **Fixed on `v1`.** Wildcards escaped rather than switching to `.eq()`, because the match must stay case-insensitive (`profiles.email` is written from the signup form verbatim). Regression test added, with a stub that implements real LIKE semantics so the test is not tautological. |
| S-20 | P2 | **Found 2026-11-15.** Eight API routes return raw Postgres `err.message` to the client, leaking constraint and column names. Export and deletion deliberately do not. | Open — S-10 already covers this; these eight are the exception that proves the control exists. |
| S-21 | P2 | **Found 2026-11-15.** Rate limiting is advisory: PostgREST is reachable directly with the same bearer token, so a client can write to any table without passing through `consume_rate_limit`. 024's comment already concedes this for `profiles`; it is true of every table. | Open. Real fix is Vercel Firewall or routing all writes through `/api/*` with PostgREST table grants revoked. |

## S-9: every RPC `authenticated` can call, and why (2026-11-14)

`anon` and `PUBLIC` have EXECUTE on none of these — 018 + 020, verified live
(no `=X/` entry in any `proacl`). This table is the whole answer to "revoke
EXECUTE unless it truly needs it": each row either cannot be revoked without
breaking RLS, or is a call the app makes.

| RPC | Who can call | Why it must stay |
|---|---|---|
| `is_family_member(code)` | authenticated | **Cannot revoke.** Used by the SELECT policies on `families`, `profiles`, `utr_entries`, `matches`, `coach_outreach`, `tournament_entries`, `daily_checkins`, `cost_calculations`, `parent_accounts`, `family_codes`, `encouragement_notes`, `parent_reports`, `season_budgets`, `budget_expenses`. Only answers about the caller. |
| `is_parent_member(code)` | authenticated | **Cannot revoke.** `season_budgets` / `budget_expenses` write policies. |
| `has_tier(tier)` | authenticated | **Cannot revoke.** Write policies on `coach_outreach` and the five training tables. |
| `account_active()` | authenticated | **Cannot revoke.** The restrictive consent policy on 21 tables (030). |
| `consent_required_for_birth_year(year)` | authenticated | **Cannot revoke.** Called by `protect_privileged_profile_columns()`, which is SECURITY INVOKER and so runs as the caller. |
| `join_family(code)` | authenticated | App: signup and "wrong code? re-enter". Rate-limited 5/hour, logs every attempt. |
| `approve_family_join(id)` | authenticated | App: the approve button. Requires an approved membership of the same family. |
| `deny_family_join(id)` | authenticated | App: the deny button. Same check. |
| `remove_family_member(id)` | authenticated | App: the family roster. Cannot evict the creator or yourself. |
| `remind_family_approval()` | authenticated | App: "Remind them". 1/hour. Bumps a timestamp; sends nothing. |
| `cancel_my_family_request()` | authenticated | App: re-entering a different code. Own row only. |
| `my_family_code()` | authenticated | App + other RPCs. Answers only about the caller. |
| `my_pending_family_request()` | authenticated | App: the waiting screen. Discloses a first name, only to someone holding a pending row for that family. |
| `family_members()` | authenticated | App: the roster and the approval card. Returns nothing to a non-member. |
| `my_consent_state()` | authenticated | App: a pending-consent account can read nothing else, so this is the only way it can learn why. Own row only. |
| `grant_parent_consent(id)` | authenticated | App: the consent button. Requires a `parent` role, an active own account, and approved membership of the child's family. |
| `family_code_is_taken(code)` | ~~authenticated~~ | **Revoke-only helper added by 032.** SECURITY DEFINER because 022's trigger is SECURITY INVOKER and an inline `exists(...)` would be filtered by RLS and silently return false — a trap worth remembering. Returns a boolean and nothing else. |
| `consume_rate_limit(bucket)` | authenticated | App: every write route. Takes no limit argument — the policy is inside the function, so a caller cannot raise its own ceiling. |
| `delete_my_account()` | authenticated | App: Delete account. **Takes no arguments** — reads `auth.uid()`, so it can only ever delete its caller. |
| `current_family_code()` | ~~authenticated~~ | **Revoked (027).** No policy and no code calls it after 027. |
| `generate_family_code()` | ~~authenticated~~ | **Revoked (027).** The app generates codes client-side; leaving this callable let anyone probe the code space without touching the rate limiter. |
| `are_friends(a,b)` | — | **Dropped (027).** Friends are removed product-wide. |
| `set_updated_at()`, `rls_auto_enable()`, `protect_privileged_profile_columns()`, `enforce_free_tier_target_limit()` | — | Trigger functions. Already revoked from `authenticated`. |

## Supabase security advisors on staging (2026-11-14)

Three findings. One is Niran's; two are deliberate.

| Advisor | Level | Decision |
|---|---|---|
| `auth_leaked_password_protection` | WARN | **Not fixed — cannot be, from here.** A project setting (Dashboard → Authentication). Listed as Niran's item in the roadmap and in HANDOFF §J's "After". |
| `authenticated_security_definer_function_executable` × 18 | WARN | **Reviewed, accepted, documented** — the table above. The count rose 17 → 18 on 2026-11-15; the eighteenth is `family_code_is_taken()` from migration 032. Four of the eighteen are load-bearing for RLS and revoking them fails the policies closed; the rest are calls the app makes. |
| `rls_enabled_no_policy` × 4 (`badges`, `friendships`, `family_join_attempts`, `rate_limit_events`) | INFO | **Not fixed, because it is the intended state.** RLS on with no policy means `authenticated` can neither read nor write. The lint exists to catch "you forgot to add policies"; here the absence IS the policy. `badges`/`friendships` are removed features (S-13); the other two are abuse-control tables that only SECURITY DEFINER functions touch. |

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
- [x] `lib/auth.ts` updated to call `join_family()` — done on `v1`, HANDOFF §J step 4b
- [ ] Stranger-account test: cannot read any other user's rows in any table (script in QA_CHECKLIST.md §RLS)
- [ ] Service-role key only in Production env on Vercel; never `NEXT_PUBLIC_*`
- [x] Rate limits on every `/api/*` write route and family join/remind (028, 023, 026) — **staging only**
- [ ] Rate limits on signup, login, password reset — **not possible in app code**; Supabase Auth project settings (Niran)
- [ ] Leaked password protection on; minimum password length ≥ 8
- [x] Security headers set and verified against a production build (S-7) — enforcing, not report-only; `script-src` still carries `'unsafe-inline'`
- [ ] Nonce-based CSP (drops `'unsafe-inline'`) — needs middleware, P2
- [x] Copilot + Stripe routes removed (P1-SEC-1, P1-SEC-5)
- [ ] **Revoke the removed credentials at the provider**, not just in Vercel: the AI key at Google, the Stripe secret key in Stripe, and rotate the Whop key. Deleting an env var does not invalidate a credential — it stays live at the provider until revoked. Niran took all three on 2026-11-11; the var names are deliberately not listed here or in `.env.example` any more, because nothing in the codebase reads them.
- [x] `get_advisors(security)` on staging: no ERROR; 2 accepted WARNs + 4 accepted INFOs, each recorded above with a reason
- [ ] Real account deletion and data export live on production (P0-8, HANDOFF §J steps 7–8)
- [ ] Privacy policy and terms reviewed by an adult/lawyer — **still the open half of P0-8.** The mechanisms are built; the document that describes them to a parent is not, and that is not Claude's to write
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
- **A function used inside an RLS policy must stay EXECUTE-able by the querying
  role.** Postgres checks the privilege against whoever runs the query, not
  against the policy's or the table's owner, so "revoke EXECUTE from
  `authenticated`" on an RLS helper fails the policy closed and breaks the
  feature. Tested on staging, 2026-11-14 — do not re-litigate it from the
  advisor's wording.
- **A rate limiter in process memory is not one.** Vercel runs many instances
  and cold-starts them; a module-scope Map multiplies every limit by the
  instance count and resets to zero on deploy. Counters go in Postgres.
- **Never let the client pass its own limit.** `consume_rate_limit(bucket)`
  takes a bucket and nothing else; the numbers live inside the function. Any
  signature with a `limit` argument is decorative.
- **Prefer a RESTRICTIVE policy to editing N permissive ones.** The consent
  gate adds one policy per table instead of rewriting ~70 existing ones, so
  no existing rule had to be re-reasoned about and removing the gate is
  dropping policies rather than restoring them.
- **Derive, never accept, a field that decides access.** `consent_status` is
  computed by the trigger from `birth_year`; and because that makes
  `birth_year` the thing that decides, it is write-once from the client.
  Closing the first hole without the second would have left a one-request
  bypass.
- Treat invented data as a security finding when it leaves the app: an address we made up is a message sent to a real third party, and a fabricated "fact" about a real institution is a statement a minor makes in their own name. Outbound recipients are always user-supplied and validated.
