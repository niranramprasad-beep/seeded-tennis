# Seeded — Database Spec

Live project `tfpjssmhiptbwigarxpx` (us-west-1). Columns: trust
`lib/db/database.types.ts` (machine-generated). This file covers purpose,
access, keys, and risks. Verified against the live DB on 2026-11-10.

Row counts at audit: 10 `auth.users`, 8 `profiles` (2 auth users have no
profile row), 6 `families`, 2 `family_codes`, 15 `utr_entries`, 0
`matches`, 0 `coach_outreach`, 0 `tournament_entries`.

## Tables
| Table | Purpose | Keys / constraints (live) | RLS summary | Risks |
|---|---|---|---|---|
| `profiles` | One per account | PK id → auth.users; FK family_code → families.code | own R/W; family read; "public" read | **S-1**: privileged columns writable; **S-5**: full-row public read; 2 orphan auth users |
| `families` | Family code registry | unique code | **SELECT true for all authenticated**; insert any | **S-2** |
| `family_codes` | Code ↔ player | FK code, FK player_id | members/owner read; owner insert | code guessable |
| `parent_accounts` | Parent ↔ family | unique(user_id, family_code) | self insert (no approval) | **S-2** |
| `utr_entries` | Self-reported UTR history | FK user_id | own; family read | no outlier check |
| `matches` | Match results | FK user_id, family_code | own; family read | — |
| `coach_outreach` | 6-stage pipeline per school | unique(user_id, school_slug); CHECK status in 6 values | own read; write needs `has_tier('family')`; family read | prod `main` writes `contacted` → rejected (P0-5) |
| `tournament_entries` | Tracked tournaments | FK user_id | own; family read | — |
| `training_plans`, `workout_sessions`, `exercises`, `session_exercises`, `saved_templates` | Training calendar | FKs to user; unique(user_id, name) on exercises | own; write needs `has_tier('player')` | POST-V1 feature |
| `daily_checkins` | Check-ins | unique(user_id, checkin_date) | own; family read | — |
| `cost_calculations` | Lifetime cost tool | FKs | own; family read | — |
| `season_budgets`, `budget_expenses` | Season budget | unique(family_code) on budgets; FK created_by/updated_by (NO ACTION) | family read; parent write | blocks user deletion until handled |
| `recruiting_checklist_items` | Plan checklist state | unique(user_id, item_key) | own | — |
| `encouragement_notes` | Parent → player notes | FKs | family read; parent insert | — |
| `parent_reports` | Weekly snapshots | unique(family_code, month) | family read/insert | nothing generates them |
| `user_settings` | Notification prefs + misc JSON | FK user_id | own | prefs stored, never used |
| `badges`, `friendships` | Removed features | — | locked | drop (P3) |

## Functions (SECURITY DEFINER)
`set_updated_at`, `current_family_code`, `is_family_member`, `is_parent_member`, `are_friends` (dead), `has_tier`. `anon` EXECUTE revoked; `authenticated` can call all via RPC (advisor WARN).

## Migrations

### Two environments now
| | project | migrations applied |
|---|---|---|
| **Production** | `tfpjssmhiptbwigarxpx` | 23 (through `performance_rls_and_indexes`) |
| **Staging** | `gnlcpnsweqbtwpaqhqqg` | the same 23, **plus** 025, 022, 023, 024 |

Staging was built from this repo on 2026-11-14 and verified against
production with a nine-category schema fingerprint (columns, constraints,
policies, indexes, triggers, functions, function grants, table grants, RLS
flags). All nine matched exactly before the new migrations were applied.

### ⚠️ The repo does not reproduce production on its own
Building a clean database from `0001`…`021` produces a **different**
`profiles` table from the one in production. Cause: `0001_init.sql` creates
`profiles` loosely, and `001_initial_saas_schema.sql`'s
`create table if not exists` is then a no-op — so every NOT NULL, default
and inline CHECK in that block is silently skipped.

Drift found (all now fixed by `025`):
`current_utr` `numeric` vs `numeric(4,2)` · `name` missing its `''` default ·
`role`, `target_school_slugs`, `weaknesses` nullable instead of NOT NULL ·
`profiles_tournaments_played_check` and `profiles_tournaments_goal_check`
missing · **`profiles_grade_check` as `grade >= 8` instead of `grade >= 1`,
which rejects any player below 8th grade and breaks the under-13 flow.**

`025_reconcile_profiles_schema_drift.sql` fixes all of it, is fully guarded,
and is a verified no-op against production.

### Live-only migrations — resolved
P1-OPS-3 recorded two migrations present on production with no repo file.
Recovered 2026-11-14 by diffing function grants:
- `set_updated_at_revoke_authenticated_direct_grant` — exactly
  `revoke execute on function public.set_updated_at() from authenticated;`
  Now reproduced on staging; function-grant fingerprints match.
- `rls_auto_enable_revoke_direct_grants` — **no separate content needed.**
  `020` already performs those revokes, and `rls_auto_enable` is a Supabase
  *platform* default (it is present on a brand-new empty project and on
  production identically), not a Seeded object.

### Ordering note
Production applied `019_rls_policy_hardening` BEFORE
`018_revoke_anon_execute_security_definer` (timestamps `…205945` vs
`…205957`), the reverse of the repo's numbering. Staging was built in
production's order. Applying them in repo-number order instead is believed
harmless — 018's revokes are independent of 019's policies — but it has not
been tested, so follow production's order if rebuilding.

### Repo files
`0001`…`021` (no `012` — reserved for the roster import), plus:
- `022_lock_privileged_profile_columns.sql` — P0-1. **Staging only.**
- `023_family_join_rpc.sql` — P0-2. **Staging only.** Breaks `lib/auth.ts`; see TODO item 1.
- `024_tier_gating_outreach_player_free_targets.sql` — P1-PRICE-1. **Staging only.**
- `025_reconcile_profiles_schema_drift.sql` — the drift above. **Staging only**, no-op on prod.

Rollout order and per-step rollback: `docs/HANDOFF.md` §J.

### Migration history naming
Production uses `0001`–`006` then timestamps. Staging is all timestamps
(the MCP assigns them). Names match the repo files, so the two map cleanly
by name, not by version string.

## Conventions
- Every new table: RLS on, policies `to authenticated`, `(select auth.uid())` form, FK indexes.
- Every migration: write file → sign-off → staging → verify with advisors + SQL tests → prod. Never edit an applied migration.
- Regenerate `database.types.ts` after every schema change.
