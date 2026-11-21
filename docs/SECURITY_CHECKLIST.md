# Seeded — Security Checklist

Current as of 2026-11-21. Read before touching auth, RLS, profiles, family,
billing or any API route. Production runs every migration through 051,
so every fix below that names a migration is **live on
production**. The database is the source of truth: check `pg_policies`,
`has_function_privilege` and `list_migrations`, not this file.

P0 = deployment blocker · P1 = before launch · P2 = soon · P3 = later

## Open

| ID | Sev | Finding | Status |
|---|---|---|---|
| S-10 / S-20 | P2 | Six API routes return raw Postgres error text on a 500 (profile, utr-entries, matches, outreach, family/budget, family/budget/expenses), leaking constraint/column names. | Open. Export, deletion and training already return generic text. |
| S-7 (part) | P2 | CSP `script-src` keeps `'unsafe-inline'`. | Open. Dropping it needs per-request nonces, which need middleware. There is no `middleware.ts` now. |
| S-13 | P3 | `badges` / `friendships` tables still exist. | Locked (RLS on, no policies, 027) — nobody can read or write them. Dropping them is cleanup. |
| Approver | P2 (MEDIUM) | Any approved member may approve a joiner, and "parent" is a role chosen at sign-up, so a player can create a second account as a parent, approve it themselves and write the budget. Any approved member (a player included) could also remove an approved parent. | **Built on STAGING only (052, 2026-11-21); production waits for Niran's go** (GO-SEQUENCE row 27, HANDOFF §J Step 27). Once a family has a parent of its own (`parent_acts_for_family`: role parent AND home family = this one, either shape), only such a parent may approve another parent (42501 `parent_approval_requires_parent`) or remove one (42501 `parents_only_remove_parent`; remove now takes 045's per-family lock). A parent whose home is another family never gatekeeps this one (an independent review found the first version locked such families). Player joiners unchanged. Guard `lib/db/parent-approval-rule.test.ts`. **Accepted residual risk:** a player can still create a fake FIRST parent with a second account in a family that has none — and that account then gatekeeps later parents and cannot be removed by a player. The "approved by" line in Settings → Family is a follow-up. Open on production until 052 ships. |
| Auth | P1 | Login / signup / password-reset rate limits and leaked-password protection. | **Cannot be fixed in app code** — the browser calls Supabase Auth directly. Supabase project settings, owner's. Current setting not verified for this doc. |
| Keys | P1 | The removed Gemini and Stripe keys must be revoked at the provider (deleting an env var does not invalidate a credential). | Owner's; open per CLAUDE.md. |
| P0-8 | P0 | Privacy policy listing processors and retention, reviewed by an adult or lawyer. People who asked to be deleted under the old soft-delete flow are owed a real deletion by hand (query in HANDOFF §J step 7). | Open; not Claude's to write. |
| Deps | P2 | `npm audit --omit=dev` | Not reviewed for this doc. |

### Known, accepted, and worth knowing
- **`family_members()` returns 15 profile-derived columns about other
  members** by design. That enumerated list is the cross-user surface and
  `/privacy` lists it.
- **`profile_row_exists(uuid)`** (035) is callable by `authenticated` and
  answers "does a profile exist for this id" for any id — an existence
  oracle. Ids are unguessable and 035's upsert guard needs it.
- **The rate-limit bypass is a session GUC** (`seeded.bypass_rate_limit`).
  No browser can set it (PostgREST exposes no `set_config`), but anything
  that ever runs attacker-chosen SQL as `authenticated` turns the limiter
  off.
- **Self-declared age.** A child who lies about their birth year defeats
  any age gate; nothing claims to verify adulthood, and the copy says so.

## Fixed (all on production)

| ID | What it was | Fix |
|---|---|---|
| S-1 | Users could UPDATE their own `subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*` — paywall bypass. | 022 trigger (extended by 030, 032, 033, 035, 041, 043). Client writes to privileged columns raise 42501; `lib/db/email-verification-gate.test.ts` pins the list. |
| S-2 | Every family code was readable and self-settable; any user could join any family. | 023 + 026: members-only `families`, joins only through `join_family()`, pending until approved, rate-limited, random codes. |
| S-3 | One Supabase project for local, preview and production. | Staging `gnlcpnsweqbtwpaqhqqg` reads by Preview + Development + local; production `tfpjssmhiptbwigarxpx` by Production only. |
| S-4 | Gemini copilot route: no tier check, no rate limit, raw errors, model wrote sessions. | Deleted (P1-SEC-1). V1 ships no AI. |
| S-5 | `profiles_discovery_read` exposed full rows of "public" profiles. | Dropped (027). After 037 an approved member reads exactly one `profiles` row — their own. |
| S-6 / S-21 | No rate limits; then limits only on our routes, bypassable via PostgREST. | 028 + 034: a trigger on every client-writable table enforces per-user hourly limits in Postgres, fails closed; routes only peek for a friendly 429. |
| S-7 | No security headers. | `next.config.mjs`: CSP, HSTS (2y, subdomains, no preload), `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, COOP. (Nonce part still open, above.) |
| S-8 | Dead Stripe endpoints live. | Deleted (P1-SEC-5); Whop is the only billing path. |
| S-9 | SECURITY DEFINER helpers callable via `/rpc`. | Reviewed; `are_friends()` dropped, `current_family_code()` / `generate_family_code()` revoked (027). Inventory below. |
| S-11 | Whop checkout return URL built from the `Origin` header. | Pinned to the site (or the preview's own origin). |
| S-12 | Under-13 gate was client-only. | 030 + 031: `birth_year` stored and write-once; `consent_status` derived by trigger; a pending account is inert (restrictive `account_active()` policy on 21 tables). |
| S-14 | Catalog shipped invented coach emails at real university domains. | Fields deleted (P0-3); recipient is user-typed; `schools-catalog-honesty.test.ts` guards it. |
| S-15 | `join_family()` raised after logging, so the attempt log rolled back and brute force was unlimited. | Expected outcomes RETURN a status; only auth and rate-limit raise. |
| S-16 | After 022+023, an approved parent couldn't read their child at all. | Family reads re-keyed on approved membership; later 036's `shares_approved_family_with()`. |
| S-17 | A first profile INSERT could carry someone else's `family_code` + `role='parent'`, bypassing approval. | 032: a `family_code` on INSERT only when no profile or link already holds it. |
| S-18 | Omitting `birth_year` skipped the under-13 gate. | 033: `birth_year` required on a client profile INSERT. |
| S-22 | A pending-consent under-13 could write tennis data (target schools, UTR, …) onto its own `profiles` row — 030's own-row carve-out covered every column. | 051 (2026-11-21): BEFORE UPDATE trigger `pending_consent_profile_guard` refuses changes to target schools, `current_utr`, weaknesses, commitment date, tournament counts and the UTR link while `account_active()` is false (42501 `consent_required`). Name/grade/GPA edits and unchanged re-saves still work. Not covered: the sign-up INSERT (TODO). Guard `lib/db/pending-consent-profile.test.ts`. |
| S-19 | Whop-supplied email used as an `ilike` pattern (`%` wildcards). | Wildcards escaped; regression test with real LIKE semantics. |
| — | Joined parents couldn't write; joiners' rows were stamped `family_code = NULL`. | 036 `stamp_family_code` trigger + both-shape membership. |
| — | Any approved member could write notes / reports / the budget. | Notes parent-only (033); client `parent_reports` insert dropped (039); budget parent-only (050). |
| — | Family data readable without paying. | 042/044/045: Family plan gates cross-member reads, budget, notes and reports, for one home family, max 4 players + 2 parents. |
| — | Parents could join/approve/consent with an unproven email. | 043: fresh proof for the current address (`request_email_verification()` → `mark_email_verified()`); never `email_confirmed_at`. |

## SECURITY DEFINER functions callable by `authenticated`

From the migration files (verify live with `has_function_privilege`).
`anon` and `PUBLIC` are revoked on all of them.

**Used inside RLS policies — cannot be revoked** (Postgres checks EXECUTE
against the querying role, so revoking fails the policy closed; tested on
staging 2026-11-14): `is_family_member`, `is_parent_member` (since 050:
caller's own `role = 'parent'` + approved member), `has_tier`,
`account_active`, `consent_required_for_birth_year`,
`shares_approved_family_with`, `shares_family_plan_with`, `family_has_tier`.

**Called by the app:** `join_family`, `approve_family_join`,
`deny_family_join`, `remove_family_member`, `leave_family`,
`remind_family_approval` (sends nothing; bumps a timestamp),
`cancel_my_family_request`, `my_family_code`, `my_pending_family_request`,
`family_members`, `my_family_has_tier`, `my_consent_state`,
`grant_parent_consent`, `request_email_verification`,
`mark_email_verified`, `consume_rate_limit`, `peek_rate_limit`,
`rate_limit_for_bucket`, `delete_my_account` (no arguments — can only delete
its caller), `profile_row_exists`, `family_code_is_taken` (granted in 032;
returns a boolean only).

**Not callable by `authenticated`:** `current_family_code`,
`generate_family_code` (027), `home_family_code`, `family_member_cap`,
`family_member_count`, `email_is_verified`, `family_account_holder`, and
the trigger functions (`protect_privileged_profile_columns`,
`stamp_family_code`, `enforce_write_rate_limit`,
`enforce_free_tier_target_limit`, `note_auth_email_change`,
`set_updated_at`). `are_friends` is dropped.

## Supabase advisors (accepted, with reasons)
- `authenticated_security_definer_function_executable` — accepted; each is
  in the inventory above.
- `rls_enabled_no_policy` on `badges`, `friendships`,
  `family_join_attempts`, `rate_limit_events` — intended: RLS on with no
  policy means no client access; only SECURITY DEFINER functions touch the
  last two.
- `auth_leaked_password_protection` — a project setting (owner's).

Re-run `get_advisors(security)` before any release; the counts above are
not re-measured for this doc.

## Done well (keep it)
- RLS is enabled on all 26 `public` tables.
- Writes go through zod-validated routes with a request-scoped,
  RLS-respecting client (`lib/api-auth.ts`), not the service role. The
  service role is used only by the three Whop routes.
- Whop webhook verifies signatures on raw bytes and ignores stale events.
- Only `.env.example` and `.env.local.example` are tracked, both
  placeholders.
- `/dev/*` previews call `notFound()` in production.

## Rules for future changes
- Never authorize in the client. `AuthGate` / `PaidGate` are cosmetic; the
  RLS policy or route check is the real gate.
- Any new `profiles` column that affects money, role, family access or
  verification goes into the 022 trigger list.
- Never scope a family query by `profiles.family_code` and never read
  another user's `profiles` row — use `lib/db/family-scope.ts`.
- A new cross-member read policy needs the Family-plan ceiling
  (`lib/db/family-plan-lock.test.ts`); a new family-wide unlock goes
  through `family_has_tier`.
- After any REVOKE, verify with `has_function_privilege` /
  `information_schema.column_privileges` — Postgres grants to PUBLIC by
  default, and restoring a dropped SECURITY DEFINER function re-grants it.
- When verifying as a user in the SQL editor, `set local role
  authenticated` — `postgres` bypasses RLS.
- Never use the service-role client for a user-initiated write.
- A function that logs an attempt and then RAISEs loses the log (S-15).
  RETURN a status for expected failures.
- When closing a privilege-escalation hole, check what legitimately used the
  same mechanism (S-16).
- A rate limiter in process memory is not one; counters go in Postgres, and
  the client never passes its own limit.
- Prefer one RESTRICTIVE policy to editing N permissive ones.
- Derive, never accept, a field that decides access — and make its input
  write-once.
- Invented data that leaves the app is a security finding: outbound
  recipients are always user-supplied and validated.

## History
The full 2026-11-10 audit text, the staging-era statuses and the
2026-11-14/15 test counts are in git history for this file and in
`docs/archive/SECURITY_REVIEW_INDEPENDENT.md`,
`docs/archive/VERIFICATION.md` and `docs/archive/OVERNIGHT_REPORT.md`.
