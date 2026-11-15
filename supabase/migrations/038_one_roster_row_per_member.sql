-- 038_one_roster_row_per_member.sql
--
-- STATUS: applied to staging 2026-11-15. NOT applied to production.
-- Ships with 036 + 037 and the code. Do not apply 036/037 without this.
--
-- Found by the third dress rehearsal, the first one run against a staging
-- database seeded in PRODUCTION'S ACTUAL DATA SHAPE rather than a convenient
-- one. Two earlier rehearsals could not have found it.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE THAT MATTERS
-- ---------------------------------------------------------------------------
-- Membership has two storage shapes (see 036): the code on your own
-- `profiles.family_code`, or an approved `parent_accounts` row. Those are
-- described everywhere in this repo as alternatives — creator vs joiner.
--
-- On production they are not alternatives. **All three `parent_accounts` rows
-- belong to users whose own `profiles.family_code` is the same code**, from
-- the pre-023 era when the app wrote both. 037 already had to account for
-- that in `remove_family_member()`. This is the same fact arriving at the
-- roster.
--
-- `family_members()` is a `UNION ALL` of the two shapes. For anyone holding
-- both, it returns them TWICE. Measured on a staging database seeded to
-- production's shape (a family of 4 profiles sharing one code, 3 of them also
-- carrying an approved link): **9 rows for 6 distinct people.**
--
-- Two user-visible consequences, both on `/family`:
--
-- 1. **Duplicate members.** `FamilyMembersCard` renders the rows with
--    `key={m.userId}`, so duplicate ids are a React key collision — a console
--    error, and one of each pair silently dropped.
--
-- 2. **"Account holder" was wrong for three people, and the Remove button was
--    hidden from all of them.** The card reads `is_creator`, which the old
--    function set `true` for the entire `profiles` branch, i.e. everyone
--    carrying the code. Its own comment claimed this was "a real fact now
--    (is_creator from the RPC), not the earlier inference from whichever
--    profiles row was oldest" — and in production's shape it is not a fact at
--    all: four people belong via their own profile. So three removable
--    members were labelled "account holder" and had no Remove button, while
--    their duplicate row offered one.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
-- One row per member, and `is_creator` now means what 037 made enforceable:
-- `user_id = family_account_holder(code)`. The UI's hidden Remove button and
-- the server's refusal in `remove_family_member()` are now the same predicate
-- rather than two guesses that happened to agree in the player-first shape.
--
-- Which of a member's two rows wins:
--   * a PENDING row wins over an approved one, so a join request can never be
--     hidden by a stale profile column; then
--   * the `parent_accounts` row wins over the `profiles` branch, because it
--     is the one carrying `reminded_at` and the real `status`.
-- `is_creator` no longer depends on which row won, so that choice cannot
-- change who the account holder appears to be.
--
-- `family_account_holder()` is deliberately NOT granted to `authenticated`
-- (037). Calling it from inside this SECURITY DEFINER function is fine: the
-- EXECUTE privilege is checked against the function owner during a DEFINER
-- call, not against the caller.

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
  )
  select m.user_id, m.name, m.email, m.role, m.status,
         m.user_id = public.family_account_holder((select code from fam)) as is_creator,
         m.joined_at, m.reminded_at, m.consent_status,
         m.current_utr, m.grade, m.graduation_year, m.onboarded,
         m.target_school_slugs, m.gender
  from one_per_member m
  order by 6 desc, 5, 7
$fn$;

revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;

-- ---------------------------------------------------------------------------
-- Verification (as a real member on staging, NOT as postgres)
-- ---------------------------------------------------------------------------
--   select count(*), count(distinct user_id) from public.family_members();
--     -> equal, and equal to the number of people in the family
--   select count(*) from public.family_members() where is_creator;
--     -> exactly 1
--   select user_id = public.family_account_holder(public.my_family_code())
--     from public.family_members() where is_creator;   -> true
--   -- and the member the UI now offers to remove really is removable:
--   select public.remove_family_member('<a non-holder member>');
--     -> {"status":"removed", ...}
--
-- ROLLBACK: re-run 037's `family_members()` verbatim (it is the
-- `create function` block in
-- supabase/migrations/037_revoke_on_removal_and_narrow_family_reads.sql,
-- minus the `drop function` before it — the signature is unchanged, so
-- `create or replace` is enough and the grants are preserved). That restores
-- the duplicate rows and the wrong "account holder" label; nothing else
-- depends on this function's shape.
