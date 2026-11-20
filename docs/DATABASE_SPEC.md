# Seeded — Database Spec

Current as of 2026-11-20. Columns: trust `lib/db/database.types.ts`
(machine-generated). This file covers purpose, access and the things that
bite. For live policy text, query `pg_policies` — not this file.

## Two projects
| | project | migrations |
|---|---|---|
| **Production** | `tfpjssmhiptbwigarxpx` (Vercel Production) | Every repo migration through **050 except 048**. Ledger: 51 rows on 2026-11-20 |
| **Staging** | `gnlcpnsweqbtwpaqhqqg` (Vercel Preview + Development, local `.env.local`) | Everything production has, plus 048 (PR E catalog tables) |

Check `list_migrations` on the project before relying on either row.
Staging holds only fake accounts — `docs/STAGING_PERSONAS.md`.

## Tables (26 in `public`, RLS enabled on every one)
"Family read" below means: readable by approved members of the owner's
family (either membership shape, via `shares_approved_family_with()`, 036)
**and** only while that family is unlocked by the Family plan (restrictive
`family_plan_required`, 042/045). A pending-consent (under-13) account reads
and writes almost nothing (restrictive `account_active()` policy on 21
tables, 030).

| Table | Purpose | Access summary |
|---|---|---|
| `profiles` | One per account | Own row only — an approved family member reads exactly 1 row, their own (037). Other members' fields come only from `family_members()`, whose columns are enumerated in SQL. Privileged columns are trigger-locked (022 → 043) |
| `families` | Family code registry | Members-only read (023) |
| `family_codes` | Code ↔ account holder (anchors `family_account_holder()`) | Members and the holder read; the holder inserts its own row at family creation (policies from 019/021; not re-checked live for this doc) |
| `parent_accounts` | Joiner ↔ family link, `pending`/`approved` | Written only by `join_family()` / approval RPCs; direct client writes rejected |
| `family_join_attempts` | Join attempt log (023) | No policies — SECURITY DEFINER only; feeds the join rate limit |
| `utr_entries` | Self-reported UTR history | Own R/W; family read |
| `matches` | Match results | Own R/W; family read |
| `tournament_entries` | Tracked tournaments; status includes `played` (047) | Own R/W; family read |
| `coach_outreach` | Outreach pipeline per school | Own read; writes need `has_tier('player')` (024); family read |
| `daily_checkins`, `cost_calculations` | Check-ins; cost tool | Own R/W; family read |
| `training_plans`, `workout_sessions`, `exercises`, `session_exercises`, `saved_templates` | Training calendar | Own; writes need `has_tier('player')`. The app reads only the manual plan (`metadata = {"kind":"manual"}`). Production still holds 28 hidden generated sessions, kept on purpose (CLAUDE.md) |
| `season_budgets`, `budget_expenses` | Season budget | Family read; **write = caller's own `role = 'parent'` + approved member (050)**; Family plan required for everything (042) |
| `encouragement_notes` | Parent → player notes | Insert = parent role + approved member (033); Family plan required (042), except a parent keeps reading notes they wrote |
| `parent_reports` | Weekly snapshots | Read only; no client insert since 039; Family plan required (042) |
| `recruiting_checklist_items` | Plan checklist state | Own |
| `user_settings` | Per-user preferences JSON (design/mode, calendar prefs) in a column still named `notification_preferences` | Own. Seeded sends no notifications |
| `rate_limit_events` | Write counters (028, 034) | No policies — SECURITY DEFINER only |
| `auth_email_changes` | When each account's auth email last changed (043) | No client access at all (grants revoked); written by an `auth.users` trigger, read by the email-verification functions |
| `badges`, `friendships` | Removed features | RLS on, no policies (027) — nobody can read or write. Drop is P3 |

## Functions
SECURITY DEFINER functions are revoked from `anon` and `PUBLIC`. The ones
`authenticated` may call, and why each must stay, are inventoried in
`docs/SECURITY_CHECKLIST.md`. Two rules learned the hard way:
- **A function used inside an RLS policy must keep EXECUTE for
  `authenticated`**, or the policy fails closed.
- **Restoring a dropped SECURITY DEFINER function re-grants EXECUTE to
  PUBLIC and `anon`.** Always follow a fresh `create` with the
  `revoke`/`grant` pair.

## Migrations: things that bite

### The repo does not reproduce production from `0001` alone
Building a clean database from `0001`…`021` produces a different `profiles`
table: `0001_init.sql` creates it loosely and `001`'s `create table if not
exists` is then a no-op, so its NOT NULLs, defaults and CHECKs are skipped
(including `profiles_grade_check` as `grade >= 8`, which breaks the under-13
flow). `025_reconcile_profiles_schema_drift.sql` fixes all of it and is a
verified no-op on production. Apply it when building a fresh database.

### Ordering
Production applied `019` before `018`. Follow production's order when
rebuilding. There is no `012` (once reserved for a roster import) and no
`048` on production (PR E, staging only).

### Live-only migrations
Production's ledger has two names with no repo file
(`set_updated_at_revoke_authenticated_direct_grant`,
`rls_auto_enable_revoke_direct_grants`); both were reconciled on 2026-11-14 (the
first is one `revoke` now reproduced on staging; the second needs no repo
content — 020 performs those revokes and `rls_auto_enable` is a Supabase
platform default).

### Naming
Production uses `0001`–`006` then timestamps; staging is all timestamps
(the MCP assigns them). Map the two by migration name, not version.

### Rollout record
Order, per-step verification and per-step rollback for 022–050:
`docs/HANDOFF.md` §J and `docs/GO-SEQUENCE.md`.

## Conventions
- Every new table: RLS on, policies `to authenticated`, `(select auth.uid())`
  form, FK indexes. A new cross-member read policy also needs the Family-plan
  ceiling (`lib/db/family-plan-lock.test.ts` fails the build otherwise).
- Every migration: file → owner sign-off → staging → verify (advisors, SQL as
  a real user with `set local role authenticated`) → owner sign-off → prod.
  Never edit an applied migration.
- Regenerate `database.types.ts` after every schema change.
