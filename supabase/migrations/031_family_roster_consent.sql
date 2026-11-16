-- 031_family_roster_consent.sql  —  P0-8 (UI half)
--
-- STATUS: APPLIED TO STAGING 2026-11-14. NOT APPLIED TO PRODUCTION.
--
-- One column. 030 made consent real in the database; this is what lets the
-- UI say the right thing about it.
--
-- family_members() (026) returns the roster the approval card and the family
-- page render. Without consent_status on it, the card showing "Kayla wants
-- to join your family as Player" cannot tell whether approving that request
-- also means recording parental consent for a 12-year-old — which is the one
-- thing the adult tapping Approve most needs to know. The alternative was a
-- second round trip per pending member, which would have been slower AND
-- made the consent language arrive after the buttons.
--
-- A separate migration rather than an edit to 030, because 030 is applied
-- (CLAUDE.md: never edit an applied migration), and because a function's
-- return type cannot change under CREATE OR REPLACE — it has to be dropped
-- first, and a DROP of a function the app calls belongs somewhere visible
-- rather than buried in a file that already did something else.
--
-- ORDERING: this migration drops and recreates family_members(). Between the
-- drop and the create, the app's roster call fails. That window is inside a
-- single migration transaction, so no deploy sees it — but it is the reason
-- 031 must be applied with 030 and the code, not separately.

drop function if exists public.family_members();

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
  -- 'not_required' | 'pending' | 'granted'. 'pending' means this member is
  -- under 13 and no adult in the family has said yes yet, so their account
  -- reads nothing (the restrictive policies in 030) even once their family
  -- link is approved.
  consent_status text
)
language sql
security definer
set search_path = public
stable
as $$
  with fam as (select public.my_family_code() as code)
  select p.id, coalesce(nullif(p.name,''),'Family member'), p.email,
         coalesce(p.role,'player'), 'approved'::text, true,
         p.created_at, null::timestamptz, p.consent_status
  from public.profiles p, fam
  where fam.code is not null
    and p.family_code = fam.code
    and public.is_family_member(fam.code)
  union all
  select pa.user_id, coalesce(nullif(p2.name,''),'Family member'), p2.email,
         coalesce(p2.role,'parent'), pa.status, false,
         pa.created_at, pa.reminded_at, p2.consent_status
  from public.parent_accounts pa
  join public.profiles p2 on p2.id = pa.user_id, fam
  where fam.code is not null
    and pa.family_code = fam.code
    and public.is_family_member(fam.code)
  order by 6 desc, 5, 7
$$;

revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;

-- ROLLBACK: docs/HANDOFF.md §J step 8 (restores 026's eight-column version).
