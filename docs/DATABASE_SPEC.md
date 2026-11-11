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
Repo files `0001`…`021` (no `012` — reserved for roster import), plus
`022_lock_privileged_profile_columns.sql` written in this audit, **not applied**.

Live history uses different names: `0001`–`006` match; later ones are
timestamped (e.g. `20261110205721 outreach_stages`). Two live migrations
have no repo file: `rls_auto_enable_revoke_direct_grants`,
`set_updated_at_revoke_authenticated_direct_grant` (content only in `020`'s
comments). Fix in P1-OPS-3.

## Conventions
- Every new table: RLS on, policies `to authenticated`, `(select auth.uid())` form, FK indexes.
- Every migration: write file → sign-off → staging → verify with advisors + SQL tests → prod. Never edit an applied migration.
- Regenerate `database.types.ts` after every schema change.
