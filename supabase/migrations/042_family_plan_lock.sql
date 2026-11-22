-- 042_family_plan_lock.sql
--
-- STATUS: written 2026-11-18 for PR B (B4, "lock the Family plan now" — the
-- owner's decision, already made). Applied and attack-probed on STAGING
-- (gnlcpnsweqbtwpaqhqqg) only. Production gets it later, on Niran's go, per
-- docs/archive/GO-SEQUENCE.md §3 and docs/HANDOFF.md §J Step 17. Needs 036
-- (shares_approved_family_with), 037 and 039 in place.
--
-- ===========================================================================
-- Why
-- ===========================================================================
-- Family is a paid tier ($19/mo, TIER_PRICE_USD), but until now nothing in
-- the database knew it: any approved member of any family — free or not —
-- could read the season budget, the parent notes, the parent reports, and
-- every other member's UTR history, matches, tournaments, check-ins, cost
-- calculations and outreach. The "lock" lived only in the UI, and
-- AuthGate/PaidGate are cosmetic. RLS is the ceiling, so the lock goes here.
--
-- ===========================================================================
-- The rule
-- ===========================================================================
-- A family is UNLOCKED when ANY of its members, in EITHER membership shape
-- (a profile carrying `family_code = code`, or an APPROVED `parent_accounts`
-- row for the code), has `subscription_tier = 'family'`. So a parent who buys
-- Family unlocks their player and a player who buys Family unlocks their
-- parents. Pending requests never count.
--
-- Locked means: no member can read ANOTHER member's rows, and nobody can read
-- or write the family's shared Family-plan rows. It never means:
--   * a member losing their OWN rows (a player's own UTR entries, a parent's
--     own notes) — every gate below short-circuits on ownership;
--   * losing data — nothing is deleted; downgrade hides, re-upgrade shows;
--   * a family being unable to FORM: family_members(), join_family(),
--     approve/deny/remove, consent and the pending-request RPCs are not
--     touched, so a free family can still invite, approve and consent.
--
-- ===========================================================================
-- What
-- ===========================================================================
--   1. family_has_tier(p_code, p_tier) — SECURITY DEFINER, stable. The rule
--      above. Two deliberate narrowings, both of which make it an answer
--      about YOUR family and never an oracle about someone else's:
--        - it answers false for a code the caller is not an approved member
--          of (when there is a caller: service-role / postgres sessions have
--          no auth.uid() and get the plain answer). Without this, any signed
--          in user could probe arbitrary codes — unrate-limited — for
--          "exists and pays", which join_family() rate-limits for a reason.
--        - unknown tiers answer false; 'free' answers true.
--      Must keep EXECUTE for `authenticated`: it is called inside RLS
--      policies, and Postgres checks the privilege against the querying role.
--   2. shares_family_plan_with(p_user_id) — 036's shares_approved_family_with
--      intersection, but a shared code only counts if THAT code is unlocked.
--      Not "is my_family_code() unlocked": a person can hold two codes (a
--      profile code AND an approved link elsewhere), and the gate has to be
--      on the family that actually links the two rows.
--   3. my_family_has_tier(p_tier) — the app's one question:
--      family_has_tier(my_family_code(), p_tier). lib/db/family-plan.ts.
--   4. RESTRICTIVE policies — a ceiling ANDed onto whatever permissive
--      policy exists today or is added later. Ten tables:
--        cross-member reads (every table whose SELECT policy uses
--        shares_approved_family_with, per pg_policies on 2026-11-18):
--          utr_entries, matches, tournament_entries, daily_checkins,
--          cost_calculations, coach_outreach
--          -> `family_plan_required` FOR SELECT:
--             user_id = auth.uid() OR shares_family_plan_with(user_id)
--        Family-plan data:
--          season_budgets, budget_expenses, parent_reports
--          -> `family_plan_required` FOR ALL:
--             family_has_tier(family_code, 'family') on USING and WITH CHECK
--          encouragement_notes
--          -> `family_plan_required` FOR ALL:
--             USING  parent_id = auth.uid() OR family_has_tier(family_code,'family')
--             CHECK  family_has_tier(family_code, 'family')
--             (the author keeps reading what they wrote; a new note needs the
--             plan. There is no client UPDATE/DELETE policy on this table.)
--      Restrictive rather than rewriting the permissive policies: the
--      existing policies stay byte-for-byte what 033/036/037/039 left, and
--      the rollback is a list of DROP POLICY statements.
--
-- Not gated, on purpose:
--   * profiles — already own-row only (037).
--   * families / family_codes / parent_accounts — membership metadata; a free
--     family needs them to form.
--   * family_members() — the roster. NOTE: it still returns 15 columns about
--     each member, including current_utr, grade and target_school_slugs, to
--     a free family. That is the owner's call ("roster stays ungated"); it is
--     flagged in docs/HANDOFF.md §J Step 17 rather than changed here.
--   * delete_my_account() / the export: SECURITY DEFINER deletion bypasses
--     RLS (owner postgres), and the export reads the caller's own rows. A
--     free family's export no longer includes the budget, which is now
--     unreadable to it; the rows themselves are kept.
--
-- ===========================================================================
-- Verify (as real users: `set local role authenticated` + jwt claims; as
-- `postgres` every row is visible and every check below "passes")
-- ===========================================================================
--   Free family (no member on 'family'):
--     parent: select count(*) from utr_entries where user_id = '<player>'  -> 0
--     parent: insert into season_budgets (...)                             -> 42501
--     player: select count(*) from utr_entries where user_id = '<player>'  -> all of their own
--     either: select public.my_family_has_tier('family')                   -> false
--     either: select count(*) from public.family_members()                 -> the whole roster
--   Parent-paid and player-paid family: the same reads return everything,
--     my_family_has_tier('family') -> true, budget insert succeeds.
--   Downgrade (as postgres, set the payer to 'free'): reads drop to 0;
--     `select count(*)` as postgres shows every row still there. Re-upgrade:
--     readable again.
--
-- ===========================================================================
-- Rollback (runnable)
-- ===========================================================================
--   begin;
--   drop policy if exists family_plan_required on public.utr_entries;
--   drop policy if exists family_plan_required on public.matches;
--   drop policy if exists family_plan_required on public.tournament_entries;
--   drop policy if exists family_plan_required on public.daily_checkins;
--   drop policy if exists family_plan_required on public.cost_calculations;
--   drop policy if exists family_plan_required on public.coach_outreach;
--   drop policy if exists family_plan_required on public.season_budgets;
--   drop policy if exists family_plan_required on public.budget_expenses;
--   drop policy if exists family_plan_required on public.parent_reports;
--   drop policy if exists family_plan_required on public.encouragement_notes;
--   drop function if exists public.my_family_has_tier(text);
--   drop function if exists public.shares_family_plan_with(uuid);
--   drop function if exists public.family_has_tier(text, text);
--   commit;
--   Policies FIRST: the functions cannot be dropped while a policy uses them.
--   Roll the app's lib/db/family-plan.ts gate back with it, or the UI keeps
--   showing a lock the database no longer enforces (harmless but untrue);
--   the API's my_family_has_tier() call would then 404 -> the routes refuse
--   (fail closed), so roll the code back first.

-- ---------------------------------------------------------------------------
-- 1. family_has_tier
-- ---------------------------------------------------------------------------
create or replace function public.family_has_tier(p_code text, p_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when p_tier = 'free' then true
    when p_code is null or p_tier is null or p_tier not in ('player', 'family') then false
    -- Only ever an answer about the caller's OWN family. No caller (service
    -- role, postgres) = no restriction.
    when auth.uid() is not null and not public.is_family_member(p_code) then false
    else exists (
      select 1
      from public.profiles p
      where (
              p.family_code = p_code
              or exists (
                select 1 from public.parent_accounts pa
                where pa.user_id = p.id
                  and pa.family_code = p_code
                  and pa.status = 'approved'
              )
            )
        and (
              (p_tier = 'player' and p.subscription_tier in ('player', 'family'))
           or (p_tier = 'family' and p.subscription_tier = 'family')
            )
    )
  end
$fn$;
revoke all on function public.family_has_tier(text, text) from public, anon;
grant execute on function public.family_has_tier(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. shares_family_plan_with
-- ---------------------------------------------------------------------------
create or replace function public.shares_family_plan_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  with mine as (
    select p.family_code as code from public.profiles p
     where p.id = auth.uid() and p.family_code is not null
    union
    select pa.family_code from public.parent_accounts pa
     where pa.user_id = auth.uid() and pa.status = 'approved'
  ),
  theirs as (
    select p.family_code as code from public.profiles p
     where p.id = p_user_id and p.family_code is not null
    union
    select pa.family_code from public.parent_accounts pa
     where pa.user_id = p_user_id and pa.status = 'approved'
  )
  select exists (
    select 1 from mine join theirs using (code)
    where public.family_has_tier(code, 'family')
  );
$fn$;
revoke all on function public.shares_family_plan_with(uuid) from public, anon;
grant execute on function public.shares_family_plan_with(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. my_family_has_tier — the app's question
-- ---------------------------------------------------------------------------
create or replace function public.my_family_has_tier(p_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.family_has_tier(public.my_family_code(), p_tier);
$fn$;
revoke all on function public.my_family_has_tier(text) from public, anon;
grant execute on function public.my_family_has_tier(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The ceiling
-- ---------------------------------------------------------------------------
-- Cross-member reads: every table whose SELECT policy calls
-- shares_approved_family_with(). Own rows always pass.
drop policy if exists family_plan_required on public.utr_entries;
create policy family_plan_required on public.utr_entries
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_family_plan_with(user_id));

drop policy if exists family_plan_required on public.matches;
create policy family_plan_required on public.matches
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_family_plan_with(user_id));

drop policy if exists family_plan_required on public.tournament_entries;
create policy family_plan_required on public.tournament_entries
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_family_plan_with(user_id));

drop policy if exists family_plan_required on public.daily_checkins;
create policy family_plan_required on public.daily_checkins
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_family_plan_with(user_id));

drop policy if exists family_plan_required on public.cost_calculations;
create policy family_plan_required on public.cost_calculations
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_family_plan_with(user_id));

drop policy if exists family_plan_required on public.coach_outreach;
create policy family_plan_required on public.coach_outreach
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_family_plan_with(user_id));

-- Family-plan data: read AND write need the plan.
drop policy if exists family_plan_required on public.season_budgets;
create policy family_plan_required on public.season_budgets
  as restrictive for all to authenticated
  using (public.family_has_tier(family_code, 'family'))
  with check (public.family_has_tier(family_code, 'family'));

drop policy if exists family_plan_required on public.budget_expenses;
create policy family_plan_required on public.budget_expenses
  as restrictive for all to authenticated
  using (public.family_has_tier(family_code, 'family'))
  with check (public.family_has_tier(family_code, 'family'));

drop policy if exists family_plan_required on public.parent_reports;
create policy family_plan_required on public.parent_reports
  as restrictive for all to authenticated
  using (public.family_has_tier(family_code, 'family'))
  with check (public.family_has_tier(family_code, 'family'));

-- The author keeps their own notes; reading the family's and writing a new
-- one need the plan. family_code is stamped by 036's BEFORE INSERT trigger,
-- which runs before WITH CHECK is evaluated.
drop policy if exists family_plan_required on public.encouragement_notes;
create policy family_plan_required on public.encouragement_notes
  as restrictive for all to authenticated
  using (parent_id = (select auth.uid()) or public.family_has_tier(family_code, 'family'))
  with check (public.family_has_tier(family_code, 'family'));
