-- Real fix for the gap migration 018 left open. 018's
-- `revoke execute ... from anon` did NOT actually work: Postgres grants
-- EXECUTE on every new function to the pseudo-role PUBLIC by default, and
-- `anon`/`authenticated` are both implicitly members of PUBLIC. Revoking a
-- privilege from `anon` specifically only removes a privilege that was
-- granted TO `anon` specifically — it does nothing when the role's access
-- actually comes from the PUBLIC default, which is exactly this case.
-- Confirmed broken by re-running the Supabase security advisor after 018/019
-- landed: all 6 functions still showed `anon_can_execute: true` via
-- `has_function_privilege`, and the advisor itself still flagged every one
-- of them under "Public Can Execute SECURITY DEFINER Function."
--
-- The advisor also flagged a 7th function neither 018 nor the original grep
-- audit found: `public.rls_auto_enable()`, a Supabase-managed event-trigger
-- function (fires on CREATE TABLE to auto-enable RLS) — not defined in any
-- migration in this repo, so a plain grep over supabase/migrations/*.sql
-- could never have found it. Included here for the same defense-in-depth
-- reasoning; nothing in this app ever calls it directly.
--
-- The real fix: revoke from PUBLIC (which removes the privilege for every
-- role, anon included), then re-grant EXECUTE to `authenticated` only for
-- the 5 helper functions real RLS policies in this project actually call
-- from policy expressions (is_family_member, current_family_code,
-- are_friends, has_tier, is_parent_member) — an authenticated row's policy
-- evaluation needs the querying role to hold EXECUTE on any function the
-- policy expression calls, so revoking from authenticated too would break
-- every policy using one of these helpers, not just lock out anon.
-- `set_updated_at()` needs no re-grant: it only ever runs from a BEFORE
-- UPDATE trigger, which executes as the table owner regardless of the
-- querying role's own grants. `rls_auto_enable()` needs no re-grant either:
-- it's an event-trigger function, never meant to be called directly by any
-- role, including authenticated.
--
-- The advisor separately flags all 6 of these (plus rls_auto_enable) as
-- "Signed-In Users Can Execute" (authenticated_security_definer_function_
-- executable) — that warning is a generic prompt to confirm intent, not a
-- second bug: `authenticated` genuinely needs EXECUTE on the 5 helpers for
-- this project's own RLS policies to evaluate at all, so that finding is
-- accepted as intentional, not fixed further.
--
-- NOT applied automatically — tracked in git for review and must be run by
-- hand against the real Supabase project, same discipline as every
-- migration in this project since 009.

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.current_family_code() from public;
revoke execute on function public.is_family_member(text) from public;
revoke execute on function public.are_friends(uuid, uuid) from public;
revoke execute on function public.has_tier(text) from public;
revoke execute on function public.is_parent_member(text) from public;
revoke execute on function public.rls_auto_enable() from public;

grant execute on function public.current_family_code() to authenticated;
grant execute on function public.is_family_member(text) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.has_tier(text) to authenticated;
grant execute on function public.is_parent_member(text) to authenticated;

-- rls_auto_enable() needed a second pass: unlike the other 6, it turned out
-- to have EXPLICIT direct grants to anon/authenticated/public (confirmed via
-- aclexplode(proacl), 4 distinct grantee role OIDs), not just the implicit
-- PUBLIC default the other 6 relied on — so `revoke ... from public` alone
-- left it untouched. Revoking directly from each role actually holding a
-- grant fixed it; re-verified via has_function_privilege after each step.
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
