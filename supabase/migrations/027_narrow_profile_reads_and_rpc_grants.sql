-- 027_narrow_profile_reads_and_rpc_grants.sql  —  S-5 (P1-SEC-2) + S-9 (P1-SEC-6)
--
-- STATUS: APPLIED TO STAGING 2026-11-14. NOT APPLIED TO PRODUCTION.
--
-- ===========================================================================
-- PART 1 — S-5: a signed-in stranger could read a minor's whole profile row
-- ===========================================================================
--
-- `profiles_discovery_read` was:
--
--   using (
--     privacy_level = 'public'
--     or id = auth.uid()
--     or are_friends(auth.uid(), id)
--     or family_code = current_family_code()
--   )
--
-- Four branches, and in V1 every one of them is either dead or dangerous:
--
--   privacy_level = 'public'   -> whole-row SELECT. Not a narrowed set of
--       fields: email, GPA, grade, graduation year, family_code, the Whop
--       membership id and both stripe ids, for a user who is 13-18. One
--       production row is currently 'public'. Nothing in the product can
--       even set this any more — P0-7 removed the "Public recruiting page"
--       toggle because the page it promised does not exist — so the only
--       people who can be exposed by it are those who toggled it while it
--       was still shipped. They consented to a feature that was never built.
--   id = auth.uid()            -> already covered by profiles_select_own.
--   are_friends(...)           -> friends are removed product-wide.
--   family_code = current_family_code()
--                              -> superseded by family_members_read, which
--       023 §8 moved onto is_family_member() precisely because
--       current_family_code() reads the caller's OWN profiles.family_code,
--       the column 022 now locks. Dead branch, and the mechanism S-16 was
--       about.
--
-- THE FIX: drop the policy. V1 has no public-profile surface at all, so the
-- honest access rule is "your own row, plus the rows of a family that has
-- approved you" — exactly profiles_select_own + family_members_read, both of
-- which stay.
--
-- Deliberately NOT replaced with a narrow public view. A view exposing
-- name + graduation year would be a real mechanism for a feature that does
-- not exist, has no reader in the codebase, and (owner-rights, to see past
-- RLS) would trip the security-definer-view advisor. When a public
-- recruiting page is actually built, that is the time to add the view, with
-- an explicit per-field opt-in rather than one `privacy_level` string.
--
-- `privacy_level` itself is left on the table and left alone: it is the
-- record of what a user chose, and no code reads it after this.

drop policy if exists "profiles_discovery_read" on public.profiles;

-- The same leak, one table over. `badges_read` exposed any badge row of any
-- 'public' profile, plus the friends branch. Badges and friendships are
-- removed product-wide (CLAUDE.md), the tables hold no live rows the product
-- reads, and S-13 has them down for a DROP. Until that drop lands, they get
-- the state S-13 describes: locked. RLS stays on with no policy, so
-- `authenticated` can neither read nor write them. No rows are deleted.

drop policy if exists "badges_read" on public.badges;
drop policy if exists "badges_write_own" on public.badges;
drop policy if exists "friendships_read_involved" on public.friendships;
drop policy if exists "friendships_insert_self" on public.friendships;
drop policy if exists "friendships_update_involved" on public.friendships;

-- ===========================================================================
-- PART 2 — S-9: EXECUTE on the SECURITY DEFINER helpers
-- ===========================================================================
--
-- The Supabase advisor flags every SECURITY DEFINER helper as callable by
-- `authenticated` through /rest/v1/rpc/*. `anon` and PUBLIC were already
-- revoked (018 + 020, verified live: no `=X/` entry in any proacl).
--
-- THE ADVISOR'S SUGGESTION CANNOT BE APPLIED TO THE FOUR RLS HELPERS.
-- Tested on staging, 2026-11-14, not reasoned about:
--
--   revoke execute on function public.is_family_member(text) from authenticated;
--   -- then, as the approved parent:
--   select count(*) from public.families;
--   -- ERROR 42501: permission denied for function is_family_member
--
-- Postgres checks EXECUTE on a function referenced inside an RLS policy
-- against the role running the query, not against the policy's or the
-- table's owner. So `authenticated` must keep EXECUTE on any function a
-- policy calls, or the policy fails closed and the feature breaks. The
-- grant is load-bearing, not an oversight.
--
-- That is acceptable, because each of the four only ever answers a question
-- about the caller:
--
--   is_family_member(code)  -> "is the CALLER an approved member of `code`?"
--   is_parent_member(code)  -> same, parent flavour
--   has_tier(tier)          -> "does the CALLER have at least `tier`?"
--   set_updated_at()        -> trigger only; already revoked (019)
--
-- The one that mattered was is_family_member(): with S-2 open it was an
-- oracle for which family codes exist. 023 closed that differently and
-- better — a valid code now grants nothing until a member approves, and
-- join_family() is rate-limited to 5 attempts/hour — so the oracle is no
-- longer worth anything. An attacker who can confirm a code still cannot
-- use it.
--
-- WHAT IS REVOKED HERE: the two helpers no policy and no app code calls.

-- current_family_code(): referenced by exactly one policy before this
-- migration (profiles_discovery_read, dropped above), by no function body,
-- and by no TypeScript. Reachable over RPC it is a harmless self-answer, but
-- an unused entry point is still an entry point.
revoke execute on function public.current_family_code() from authenticated;

-- generate_family_code(): the app generates codes in lib/auth.ts
-- (crypto.getRandomValues, same alphabet and length), and join_family()
-- does not call this. Leaving it callable let any signed-in user mint
-- unlimited unused codes and — because it loops until the candidate is
-- unused — probe the code space without touching family_join_attempts,
-- i.e. around the rate limiter. Service role keeps it for operational use.
revoke execute on function public.generate_family_code() from authenticated;

-- are_friends(): the last reference to it went with badges_read above.
-- Friends are removed product-wide; a dead SECURITY DEFINER function that
-- reads another user's relationships is not worth keeping for the day
-- someone changes their mind.
drop function if exists public.are_friends(uuid, uuid);

-- ===========================================================================
-- Verification (run as a test user on staging, not as postgres)
-- ===========================================================================
--   -- stranger sees no row but their own:
--   select count(*) from public.profiles;                  -> 1
--   -- approved parent still sees the family:
--   select count(*) from public.profiles;                  -> 2
--   select count(*) from public.families;                  -> 1
--   -- player still saves their own profile, still logs a UTR entry:
--   update public.profiles set name = name where id = auth.uid();  -> OK
--   -- the two revoked RPCs are gone from the surface:
--   select public.current_family_code();    -> ERROR 42501
--   select public.generate_family_code();   -> ERROR 42501
--   select public.are_friends(auth.uid(), auth.uid());  -> ERROR 42883
--
-- ROLLBACK: docs/HANDOFF.md §J step 5.
