-- 032_block_family_code_on_profile_insert.sql
--
-- STATUS: APPLIED AND ATTACK-TESTED ON STAGING (gnlcpnsweqbtwpaqhqqg).
-- NOT APPLIED TO PRODUCTION. Needs explicit, current-turn sign-off.
--
-- ===========================================================================
-- Closes: unapproved family takeover via the profiles INSERT path.
-- Found by independent security review, 2026-11-14. Severity: critical.
-- ===========================================================================
--
-- THE HOLE
--
-- 022's trigger protects `family_code` and `role` on UPDATE only. Its INSERT
-- branch resets subscription_tier / whop / stripe / consent columns and then
-- returns `new` unchanged — so `family_code` is whatever the client sent.
--
-- `profiles_insert_own` lets any authenticated user insert their own row
-- (id = auth.uid()), and no trigger on auth.users creates that row first, so
-- every freshly signed-up account has a profile INSERT available to it. A
-- malicious client simply includes the family code:
--
--   insert into profiles (id, name, email, country, role, family_code)
--   values (auth.uid(), 'Mal', 'mal@…', 'US', 'parent', '<victim code>');
--
-- `is_family_member()` and `is_parent_member()` both read
-- `profiles.family_code` directly, so that one statement is instantly:
--   * full family READ — the minor's name, email, birth_year, gpa,
--     current_utr, home_area, matches, utr_entries, coach_outreach,
--     tournament_entries, budgets, parent_reports, encouragement_notes;
--   * `family_members()` membership, listed as approved and is_creator,
--     which also discloses every member's email and consent_status,
--     including an under-13 sibling's;
--   * with role='parent', parent-level WRITE on season_budgets and
--     budget_expenses, and the ability to write encouragement_notes
--     addressed to the child.
--
-- It bypasses 023/026 entirely. lib/auth.ts's join branch carries a comment
-- saying writing family_code here "would both be rejected by 022 on the
-- update path and silently grant the access the approval step exists to
-- withhold" — the first half is true, the second half was the only thing
-- holding the door, and it was client-side politeness, not a control.
--
-- THE FIX
--
-- A `family_code` on INSERT is legitimate in exactly one case: the person is
-- CREATING a family, so the code is brand new and nobody holds it. Joining an
-- existing family must go through join_family() and land PENDING. So: allow a
-- family_code on INSERT only when no other profile and no parent_accounts row
-- already references it.
--
-- WHY THE LOOKUP NEEDS A SECURITY DEFINER HELPER
--
-- 022's trigger is SECURITY INVOKER on purpose (a DEFINER trigger would see
-- current_user = postgres and let every client write through). But that means
-- an `exists (select 1 from public.profiles …)` written inline in the trigger
-- runs as `authenticated` and is itself filtered by RLS — the attacker cannot
-- see the victim's profile, so the subquery would return false and the check
-- would pass. The helper below is SECURITY DEFINER so the existence check
-- sees the real table, and returns only a boolean, so it discloses nothing
-- beyond "this code is taken" — which the `families` unique constraint
-- already tells any caller.

-- ---------------------------------------------------------------------------
-- 1. The existence check, RLS-independent and boolean-only
-- ---------------------------------------------------------------------------

create or replace function public.family_code_is_taken(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_code is not null and (
    exists (select 1 from public.profiles p where p.family_code = p_code)
    or exists (select 1 from public.parent_accounts pa where pa.family_code = p_code)
  );
$$;

revoke all on function public.family_code_is_taken(text) from public, anon;
grant execute on function public.family_code_is_taken(text) to authenticated;

comment on function public.family_code_is_taken(text) is
  'True when any profile or parent_accounts row already references this family code. SECURITY DEFINER so the 022 INSERT guard can see past RLS; returns a boolean only.';

-- ---------------------------------------------------------------------------
-- 2. 022's trigger function, with the INSERT branch closed
-- ---------------------------------------------------------------------------
-- Unchanged from 022 except for the marked block. Still SECURITY INVOKER,
-- still exempting service_role / postgres / supabase_admin so the Whop
-- webhook, delete_my_account() and support fixes are never blocked.

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;
    new.consent_status :=
      case when public.consent_required_for_birth_year(new.birth_year)
           then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;

    -- >>> 032: the fix. A family_code on INSERT may only be a NEW code.
    -- Creating a family => nobody holds the code yet, so this passes.
    -- Joining one => the code is already held, so this raises, and the
    -- joiner has to go through join_family() and wait to be approved.
    if new.family_code is not null
       and public.family_code_is_taken(new.family_code) then
      raise exception
        'Use the join code to request access to an existing family; it cannot be set on a profile directly.'
        using errcode = '42501';
    end if;
    -- <<< 032

    return new;
  end if;

  if new.subscription_tier      is distinct from old.subscription_tier
  or new.whop_membership_id     is distinct from old.whop_membership_id
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.role                   is distinct from old.role
  or new.family_code            is distinct from old.family_code
  then
    raise exception 'This profile field can only be changed by Seeded.'
      using errcode = '42501';
  end if;

  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;

  if old.birth_year is null and new.birth_year is not null then
    new.consent_status :=
      case when public.consent_required_for_birth_year(new.birth_year)
           then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
  else
    new.consent_status     := old.consent_status;
    new.consent_granted_at := old.consent_granted_at;
    new.consent_granted_by := old.consent_granted_by;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run on staging as a real user, not as postgres)
-- ---------------------------------------------------------------------------
-- begin;
--   set local role authenticated;
--   set local "request.jwt.claims" = '{"sub":"<new user with no profile>","role":"authenticated"}';
--   -- expect: 42501, 'Use the join code to request access…'
--   insert into profiles (id, name, email, country, role, family_code)
--   values ('<that uuid>','Mal','mal@test.example','US','parent','<victim code>');
--   -- expect: success — a brand-new code is a family being created
--   insert into profiles (id, name, email, country, role, family_code)
--   values ('<that uuid>','Mal','mal@test.example','US','player','BRANDNEWCODE');
-- rollback;
