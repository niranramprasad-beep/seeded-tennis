-- 022_lock_privileged_profile_columns.sql
--
-- STATUS: WRITTEN, NOT APPLIED. Do not apply without explicit sign-off.
-- Apply to the STAGING project first (MASTER_ROADMAP P0-6), then prod.
--
-- Problem (confirmed live 2026-11-10): `authenticated` has UPDATE on every
-- column of public.profiles and `profiles_update_own` only checks
-- `auth.uid() = id`. There is no trigger guarding billing/role columns.
-- A signed-in user can PATCH their own row via PostgREST and set:
--   subscription_tier   -> free Family plan; also defeats has_tier() RLS
--   role / family_code  -> become a "parent" of any family (see P0-2)
--   whop_membership_id  -> point /api/whop/membership at someone else's
--                          membership and receive its manage_url
--   stripe_*            -> same class of problem on the shelved path
--
-- Fix: a SECURITY INVOKER trigger. Inside a PostgREST request current_user
-- is `authenticated` or `service_role`; in the SQL editor it is `postgres`.
-- Only the service role (Whop webhook) and the DB owner may change these
-- columns. SECURITY INVOKER matters: a SECURITY DEFINER function would see
-- current_user = owner and let everything through.
--
-- role and family_code: still settable on INSERT (signup needs them) — the
-- INSERT path is closed separately by P0-2's join_family() RPC. On UPDATE
-- they may not change from the client at all.

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
    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;
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

  return new;
end;
$$;

revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;

drop trigger if exists profiles_protect_privileged on public.profiles;
create trigger profiles_protect_privileged
  before insert or update on public.profiles
  for each row execute function public.protect_privileged_profile_columns();

-- Verification (run as a test user on staging, not as postgres):
--   update profiles set subscription_tier = 'family' where id = auth.uid();
--   -> ERROR 42501
--   update profiles set name = name where id = auth.uid();
--   -> OK
-- And confirm the Whop webhook (service role) can still change the tier.
--
-- App follow-up in the same PR: lib/auth.ts writeCurrentPlayerProfile()
-- currently sends `role` and `family_code` from the client body on every
-- profile save. Unchanged values pass this trigger, but remove both from
-- PlayerBodySchema so the API can't even express the change.
