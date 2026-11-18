-- 044_roster_respects_family_plan.sql
--
-- STATUS: written 2026-11-18 for PR B. Applied and probed on STAGING
-- (gnlcpnsweqbtwpaqhqqg) only. Production gets it after 042, on Niran's go,
-- per docs/GO-SEQUENCE.md §3b and docs/HANDOFF.md §J Step 19. Needs 038
-- (the definition replaced here) and 042 (family_has_tier).
--
-- ===========================================================================
-- Why
-- ===========================================================================
-- 042 locked every cross-member read behind the Family plan: a free family's
-- parent reads 0 of the player's utr_entries. But it deliberately left the
-- roster alone, and the roster still returned each member's current_utr,
-- grade, graduation_year, target_school_slugs and gender to every approved
-- member of ANY family. So a free parent could not read the player's UTR
-- history, yet read the player's current UTR, class year and target list
-- straight off family_members(). The paywall had a side door, and it was the
-- columns the paid screens are built from.
--
-- ===========================================================================
-- What
-- ===========================================================================
-- Same signature, same 15 return columns in the same order, same row set.
-- The five player-stat columns
--
--     current_utr, grade, graduation_year, target_school_slugs, gender
--
-- are NULL unless family_has_tier(<the caller's family code>, 'family') is
-- true — the exact predicate 042's policies use, so the roster and the
-- tables cannot disagree about whether a family is unlocked.
--
-- Deliberately NOT gated (the approval and consent flow needs them, and a
-- free family must still be able to form — 042's own rule):
--     user_id, name, email, role, status, is_creator, joined_at,
--     reminded_at, consent_status, onboarded
--
-- One exception to the gate: the caller's OWN row keeps its stats. They can
-- read those from their own `profiles` row anyway (037: own row only), so
-- blanking them here protects nothing and would make a free player's own
-- numbers disappear from any screen that reads them through the roster.
--
-- `create or replace` with an identical return type keeps the existing
-- grants (unlike drop + create, which re-grants EXECUTE to PUBLIC); the
-- revoke/grant pair is re-asserted anyway, because the cost of being wrong
-- about that is the whole roster readable by `anon`.
--
-- ===========================================================================
-- Verify (as real users: `set local role authenticated` + jwt claims. As
-- postgres auth.uid() is NULL, my_family_code() is NULL and the function
-- returns 0 rows, which proves nothing.)
-- ===========================================================================
--   Free family (PB1), as the parent:
--     select name, current_utr, grade, graduation_year, target_school_slugs,
--            gender from public.family_members() where user_id <> auth.uid();
--       -> names present, all five stat columns NULL
--   Family-plan family (PB2 parent-paid, PB3 player-paid), as the parent:
--       -> the player's stats present
--   Pending joiner: 0 rows, exactly as before 044.
--   Grants: select grantee from information_schema.routine_privileges
--           where routine_name = 'family_members';
--       -> postgres, authenticated, service_role. Never PUBLIC or anon.
--
-- ===========================================================================
-- Rollback (runnable; restores 038's definition verbatim)
-- ===========================================================================
--   begin;
--   create or replace function public.family_members()
--   returns table (
--     user_id uuid, name text, email text, role text, status text,
--     is_creator boolean, joined_at timestamptz, reminded_at timestamptz,
--     consent_status text, current_utr numeric, grade integer,
--     graduation_year integer, onboarded boolean,
--     target_school_slugs text[], gender text
--   )
--   language sql
--   security definer
--   set search_path = public
--   stable
--   as $fn$
--     with fam as (select public.my_family_code() as code),
--     both_shapes as (
--       select p.id as user_id,
--              coalesce(nullif(p.name,''),'Family member') as name,
--              p.email,
--              coalesce(p.role,'player') as role,
--              'approved'::text as status,
--              p.created_at as joined_at,
--              null::timestamptz as reminded_at,
--              p.consent_status,
--              p.current_utr, p.grade, p.graduation_year, p.onboarded,
--              p.target_school_slugs, p.gender,
--              2 as shape_rank
--       from public.profiles p, fam
--       where fam.code is not null
--         and p.family_code = fam.code
--         and public.is_family_member(fam.code)
--       union all
--       select pa.user_id,
--              coalesce(nullif(p2.name,''),'Family member'),
--              p2.email,
--              coalesce(p2.role,'parent'),
--              pa.status,
--              pa.created_at,
--              pa.reminded_at,
--              p2.consent_status,
--              p2.current_utr, p2.grade, p2.graduation_year, p2.onboarded,
--              p2.target_school_slugs, p2.gender,
--              1
--       from public.parent_accounts pa
--       join public.profiles p2 on p2.id = pa.user_id, fam
--       where fam.code is not null
--         and pa.family_code = fam.code
--         and public.is_family_member(fam.code)
--     ),
--     one_per_member as (
--       select distinct on (b.user_id)
--              b.user_id, b.name, b.email, b.role, b.status,
--              b.joined_at, b.reminded_at, b.consent_status,
--              b.current_utr, b.grade, b.graduation_year, b.onboarded,
--              b.target_school_slugs, b.gender
--       from both_shapes b
--       order by b.user_id, (b.status = 'pending') desc, b.shape_rank
--     )
--     select m.user_id, m.name, m.email, m.role, m.status,
--            m.user_id = public.family_account_holder((select code from fam)) as is_creator,
--            m.joined_at, m.reminded_at, m.consent_status,
--            m.current_utr, m.grade, m.graduation_year, m.onboarded,
--            m.target_school_slugs, m.gender
--     from one_per_member m
--     order by 6 desc, 5, 7
--   $fn$;
--   revoke all on function public.family_members() from public, anon;
--   grant execute on function public.family_members() to authenticated;
--   commit;
--   Roll back BEFORE 042's rollback if both go: this body calls
--   family_has_tier(), which 042's rollback drops. (Dropping it under this
--   function would not fail at drop time — SQL function bodies are not
--   dependency-tracked — but every roster read would then raise 42883.)

create or replace function public.family_members()
returns table (
  user_id uuid,
  name text,
  email text,
  role text,
  status text,
  is_creator boolean,
  joined_at timestamptz,
  reminded_at timestamptz,
  consent_status text,
  current_utr numeric,
  grade integer,
  graduation_year integer,
  onboarded boolean,
  target_school_slugs text[],
  gender text
)
language sql
security definer
set search_path = public
stable
as $fn$
  with fam as (select public.my_family_code() as code),
  -- 044: the Family plan gate, asked once. The same predicate as 042's
  -- family_plan_required policies.
  plan as (
    select coalesce(public.family_has_tier(fam.code, 'family'), false) as unlocked
    from fam
  ),
  both_shapes as (
    -- the code on your own profile
    select p.id as user_id,
           coalesce(nullif(p.name,''),'Family member') as name,
           p.email,
           coalesce(p.role,'player') as role,
           'approved'::text as status,
           p.created_at as joined_at,
           null::timestamptz as reminded_at,
           p.consent_status,
           p.current_utr, p.grade, p.graduation_year, p.onboarded,
           p.target_school_slugs, p.gender,
           2 as shape_rank          -- loses to the parent_accounts row
    from public.profiles p, fam
    where fam.code is not null
      and p.family_code = fam.code
      and public.is_family_member(fam.code)
    union all
    -- an approved (or pending) parent_accounts link
    select pa.user_id,
           coalesce(nullif(p2.name,''),'Family member'),
           p2.email,
           coalesce(p2.role,'parent'),
           pa.status,
           pa.created_at,
           pa.reminded_at,
           p2.consent_status,
           p2.current_utr, p2.grade, p2.graduation_year, p2.onboarded,
           p2.target_school_slugs, p2.gender,
           1
    from public.parent_accounts pa
    join public.profiles p2 on p2.id = pa.user_id, fam
    where fam.code is not null
      and pa.family_code = fam.code
      and public.is_family_member(fam.code)
  ),
  one_per_member as (
    select distinct on (b.user_id)
           b.user_id, b.name, b.email, b.role, b.status,
           b.joined_at, b.reminded_at, b.consent_status,
           b.current_utr, b.grade, b.graduation_year, b.onboarded,
           b.target_school_slugs, b.gender
    from both_shapes b
    order by b.user_id, (b.status = 'pending') desc, b.shape_rank
  ),
  shown as (
    select m.*,
           (plan.unlocked or m.user_id = auth.uid()) as stats_visible
    from one_per_member m, plan
  )
  select s.user_id, s.name, s.email, s.role, s.status,
         s.user_id = public.family_account_holder((select code from fam)) as is_creator,
         s.joined_at, s.reminded_at, s.consent_status,
         case when s.stats_visible then s.current_utr end         as current_utr,
         case when s.stats_visible then s.grade end               as grade,
         case when s.stats_visible then s.graduation_year end     as graduation_year,
         s.onboarded,
         case when s.stats_visible then s.target_school_slugs end as target_school_slugs,
         case when s.stats_visible then s.gender end              as gender
  from shown s
  order by 6 desc, 5, 7
$fn$;

revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;
