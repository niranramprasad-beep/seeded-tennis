-- 033_parent_notes_and_required_birth_year.sql
--
-- STATUS: APPLIED TO STAGING 2026-11-15. NOT APPLIED TO PRODUCTION.
--
-- Two findings from the independent verification pass, both of the same
-- shape: a control that the product DESCRIBES but does not enforce.

-- ---------------------------------------------------------------------------
-- 1. encouragement_notes: an approved PARENT, not any approved member
-- ---------------------------------------------------------------------------
-- The policy is named `encouragement_notes_insert_parent` and its WITH CHECK
-- is `parent_id = auth.uid() AND is_family_member(family_code)`. That second
-- clause is "any approved member of this family" — it says nothing about
-- being a parent. So a sibling player, or any approved joiner, could write a
-- note to the child that the UI presents as coming from a parent.
--
-- Nobody noticed because the policy's NAME asserted the rule its body did
-- not implement. Both the privacy policy and CLAUDE.md inherited the claim.
--
-- `is_parent_member()` is not the fix either: it returns true for ANY
-- approved parent_accounts row regardless of `profiles.role`, so it has the
-- same hole one level down. The check below is explicit about both halves —
-- the writer's own role IS 'parent', AND they are an approved member.

drop policy if exists "encouragement_notes_insert_parent" on public.encouragement_notes;

create policy "encouragement_notes_insert_parent"
on public.encouragement_notes for insert
to authenticated
with check (
  parent_id = (select auth.uid())
  and public.is_family_member(family_code)
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'parent'
  )
);

-- ---------------------------------------------------------------------------
-- 2. birth_year is required on a client INSERT
-- ---------------------------------------------------------------------------
-- The under-13 consent gate (030) derives `consent_status` from
-- `birth_year`, and `consent_required_for_birth_year(null)` is FALSE. So a
-- profile INSERT that simply OMITS birth_year lands `not_required`, and
-- `account_active()` — which all 21 restrictive policies hang off — returns
-- true. The entire gate is skipped by leaving a field out.
--
-- Verified on staging before writing this: `birth_year` is nullable, its
-- CHECK explicitly permits NULL, and the trigger's INSERT branch accepted a
-- row without it.
--
-- WHY RAISE RATHER THAN DEFAULT TO 'pending'. Defaulting to pending would
-- lock out any account created by a path that forgot the field — a silent,
-- confusing failure for a real user. Raising is loud, happens in
-- development, and names the problem. Every client signup path already sends
-- it: components/auth/signup-flow.tsx, the pre-auth form in
-- seeded-pre-auth-onboarding.tsx, and completeOAuthProfile for Google.
--
-- WHY NOT `alter column birth_year set not null`. Existing rows have NULL
-- and are legitimately grandfathered — they predate the column. A NOT NULL
-- would require backfilling a birth year we do not have, i.e. inventing one.
-- This constrains NEW client inserts only.
--
-- The service role is still exempt (first branch of the trigger), so the
-- Whop webhook and any support tooling are unaffected.

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 032: a family_code may only be claimed if no one holds it yet.
    if new.family_code is not null and public.family_code_is_taken(new.family_code) then
      raise exception 'Use the join code to request access to an existing family; it cannot be set on a profile directly.'
        using errcode = '42501';
    end if;

    -- 033: the under-13 gate cannot be skipped by omitting the field.
    if new.birth_year is null then
      raise exception 'A birth year is required to create an account.'
        using errcode = '23502';
    end if;

    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;
    new.consent_status :=
      case when public.consent_required_for_birth_year(new.birth_year)
           then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
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

revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;

-- ROLLBACK: docs/HANDOFF.md §J step 10.
