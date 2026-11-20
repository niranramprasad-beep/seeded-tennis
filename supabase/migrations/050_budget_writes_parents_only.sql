-- 050_budget_writes_parents_only.sql
--
-- STATUS: see docs/GO-SEQUENCE.md row 24 and `list_migrations` — not this line.
--
-- The season budget is parent-only, in the database.
--
-- BEFORE: `is_parent_member(code)` was
--     (caller's own profile has family_code = code AND role = 'parent')
--  OR (caller has an APPROVED parent_accounts row for code)   <- any role
-- The second branch never looked at `profiles.role`, and every joiner —
-- player or parent — gets a parent_accounts row. So a sibling PLAYER who
-- joined with the code could insert/update/delete `season_budgets` and
-- `budget_expenses`. Measured twice on 2026-11-15 through the app's own
-- client (docs/TODO.md "WEEK 1, ITEM #1"), disclosed in /privacy since.
--
-- AFTER: the caller's OWN `profiles.role` is 'parent' AND they are an approved
-- member of that family in either membership shape (is_family_member(): the
-- creator's profiles.family_code, or an approved parent_accounts row). This
-- is 033's pattern for encouragement_notes, applied one level down so all six
-- budget write policies pick it up without being re-created.
--
-- WHAT ELSE GATES THESE WRITES (unchanged, and still required):
--   * RESTRICTIVE `family_plan_required` (042/045): family_has_tier(code,
--     'family') on USING and WITH CHECK — a free family cannot write at all.
--   * RESTRICTIVE `account_active_required` (030): a pending under-13 cannot.
-- Those are ANDed with this. A role check here does not replace them.
--
-- `is_parent_member` is used by exactly six policies, all on these two
-- tables (checked on production 2026-11-20: pg_policies + pg_proc bodies),
-- so narrowing it changes nothing else. `profiles.role` is a privileged
-- column (022): a client cannot change its own role, so this cannot be
-- self-granted.
--
-- 043 (parent email proof) deliberately does NOT apply here: see
-- docs/DECISIONS.md 2026-11-20 "Budget writes do not need 043's proof".
--
-- Independent of 048 (PR E's catalog tables): neither file references any
-- object the other creates or changes. Apply order on production: 050, then
-- 048 (GO-SEQUENCE rows 24–25).

create or replace function public.is_parent_member(target_family_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_family_code is not null
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'parent'
     )
     and public.is_family_member(target_family_code)
$$;

-- `create or replace` keeps existing grants, but restate them so this file is
-- correct on its own (CLAUDE.md trap #2). EXECUTE must stay with
-- `authenticated`: six RLS policies call this and Postgres checks the
-- privilege as the querying role, so revoking it would fail every budget
-- write closed for everyone, parents included.
revoke all on function public.is_parent_member(text) from public;
revoke all on function public.is_parent_member(text) from anon;
grant execute on function public.is_parent_member(text) to authenticated;
grant execute on function public.is_parent_member(text) to service_role;

comment on function public.is_parent_member(text) is
  '050: caller''s own profiles.role = ''parent'' AND approved member (either shape). '
  'Used only by season_budgets / budget_expenses write policies. '
  'Family-plan and consent gates are separate RESTRICTIVE policies.';

-- ---------------------------------------------------------------------------
-- ROLLBACK (pasteable; tested on staging 2026-11-20). Restores the pre-050
-- body byte-for-byte in behaviour, then restates grants.
-- ---------------------------------------------------------------------------
-- create or replace function public.is_parent_member(target_family_code text)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $fn$
--   select exists (
--     select 1 from public.profiles p
--     where p.id = auth.uid()
--       and p.family_code = target_family_code
--       and p.role = 'parent'
--   )
--   or exists (
--     select 1 from public.parent_accounts pa
--     where pa.user_id = auth.uid()
--       and pa.family_code = target_family_code
--       and pa.status = 'approved'
--   )
-- $fn$;
-- revoke all on function public.is_parent_member(text) from public;
-- revoke all on function public.is_parent_member(text) from anon;
-- grant execute on function public.is_parent_member(text) to authenticated;
-- grant execute on function public.is_parent_member(text) to service_role;
-- comment on function public.is_parent_member(text) is null;
