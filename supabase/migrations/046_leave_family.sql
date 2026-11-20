-- 046_leave_family.sql
--
-- STATUS: written 2026-11-19 for PR D (D6, Settings → Family). Applied and
-- probed on STAGING (gnlcpnsweqbtwpaqhqqg) only. NOT on production — it
-- needs Niran's go like every other migration. Needs 026 (my_family_code),
-- 037/038 (family_account_holder) and 045 (home_family_code).
--
-- ===========================================================================
-- Why
-- ===========================================================================
-- Settings → Family gets a "Leave family" button. There was no way to do it:
-- remove_family_member() refuses p_user_id = auth.uid() ("You cannot remove
-- yourself.") on purpose — it is the tool for removing SOMEONE ELSE, and
-- letting it take the caller would make one function answer two questions.
-- parent_accounts has no client DELETE policy and profiles.family_code is a
-- privileged column (022/030/035's trigger), so the client cannot do it
-- either. Hence one narrow SECURITY DEFINER function.
--
-- ===========================================================================
-- What leave_family() does
-- ===========================================================================
-- * Takes NO arguments. It can only ever act on its caller, like
--   delete_my_account() (029). There is no uuid to point at someone else.
-- * Leaves the caller's HOME family (my_family_code(), i.e. 045's
--   home_family_code(auth.uid())) — the same family every screen calls
--   "your family".
-- * Refuses ('not_in_a_family', 22023) if the caller has no approved family.
--   A PENDING request is not membership: cancel_my_family_request() (026)
--   already handles that, and /family's pending screen offers it.
-- * Refuses ('account_holder_cannot_leave', 22023) if the caller is
--   family_account_holder(code) — the one member remove_family_member()
--   also refuses. Letting the holder leave would hand the family to whoever
--   family_account_holder() happens to pick next (or nobody, when
--   family_codes anchors the code to them), which is an ownership transfer
--   nobody asked for. The holder's way out is deleting their account
--   (delete_my_account(), which already handles the last-member case).
-- * Deletes every parent_accounts row the CALLER has for that code (approved
--   or pending — leaving means leaving), and clears the caller's own
--   profiles.family_code if it equals that code (production's pre-023
--   double-linked shape). The clear uses remove_family_member()'s guard
--   verbatim: only when someone else still holds the code or family_codes
--   anchors it, so the code is never orphaned. For a non-holder one of those
--   is always true; the guard is kept for parity, not because it fires.
-- * Never touches another member's rows. Every DELETE/UPDATE is keyed on
--   auth.uid().
-- * Under-13 consent: consent was recorded by a parent IN THIS FAMILY. A
--   member who leaves and is under the consent age with no family left goes
--   back to consent_status = 'pending' — inert until a parent in a new
--   family consents (join_family() still works for them, the one deliberate
--   exception). That is the safe direction; keeping 'granted' would carry a
--   consent given by people who are no longer their family. If they are
--   still approved in another family the consent is left alone.
-- * The Family-plan unlock follows automatically (045): family_has_tier()
--   requires the payer's HOME family to be the family, so a payer who leaves
--   takes the unlock with them. Nothing here has to do it.
-- * Rows the caller wrote while a member (matches, notes, …) keep their
--   stamped family_code. They stop being readable by the family anyway:
--   036's shares_approved_family_with() keys off the row OWNER's current
--   membership, not the stamp.
--
-- Not changed: every policy, every other function. remove_family_member()
-- still refuses self.
--
-- Returns {"status":"left","family_code_cleared":bool,"links_removed":int,
--          "consent_reset":bool}.
--
-- ===========================================================================
-- ROLLBACK (paste as one block)
-- ===========================================================================
-- drop function if exists public.leave_family();
--
-- Nothing else to restore: 046 creates one function and changes nothing
-- that existed before it. A member who left while 046 was live stays out —
-- re-joining is join_family() + an approval, as for anyone.
-- ===========================================================================

create or replace function public.leave_family()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_links_deleted int := 0;
  v_rows int;
  v_has_code_on_profile boolean;
  v_other_holders int;
  v_code_anchored boolean;
  v_code_cleared boolean := false;
  v_birth_year int;
  v_consent text;
  v_consent_reset boolean := false;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
    raise exception 'not_in_a_family' using errcode = '22023';
  end if;

  if v_user = public.family_account_holder(v_code) then
    raise exception 'account_holder_cannot_leave' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.profiles where id = v_user and family_code = v_code
  ) into v_has_code_on_profile;

  delete from public.parent_accounts
  where user_id = v_user and family_code = v_code;
  get diagnostics v_links_deleted = row_count;

  if v_has_code_on_profile then
    select count(*) into v_other_holders
    from public.profiles
    where family_code = v_code and id <> v_user;

    select exists (select 1 from public.family_codes fc where fc.code = v_code)
      into v_code_anchored;

    if v_other_holders > 0 or v_code_anchored then
      update public.profiles set family_code = null
      where id = v_user and family_code = v_code;
      get diagnostics v_rows = row_count;
      v_code_cleared := v_rows > 0;
    end if;
  end if;

  -- Under-13 consent belonged to the family they just left.
  select birth_year, consent_status into v_birth_year, v_consent
  from public.profiles where id = v_user;

  if v_consent = 'granted'
     and public.consent_required_for_birth_year(v_birth_year)
     and public.my_family_code() is null
  then
    update public.profiles
    set consent_status = 'pending',
        consent_granted_at = null,
        consent_granted_by = null
    where id = v_user;
    v_consent_reset := true;
  end if;

  return jsonb_build_object(
    'status', 'left',
    'family_code_cleared', v_code_cleared,
    'links_removed', v_links_deleted,
    'consent_reset', v_consent_reset
  );
end;
$$;

-- A freshly created SECURITY DEFINER function is executable by PUBLIC (and
-- so anon). Close that, then open it to signed-in users only.
revoke all on function public.leave_family() from public, anon;
grant execute on function public.leave_family() to authenticated;
