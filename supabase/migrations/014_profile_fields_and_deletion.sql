-- Backs 3 new "Player profile" fields on /settings' Profile tab (pixel-exact
-- to "17 Settings + account.png") that had no storage anywhere before this:
-- Home area, UTR profile link, and Unweighted GPA. Full name, grad year and
-- Team already map onto profiles.name/graduation_year/gender — no migration
-- needed for those.
--
-- Also adds `deletion_requested_at`, the real (soft-delete-with-grace-period)
-- backing for the "Delete account" flow: clicking it, after an explicit
-- confirmation dialog, only ever sets this timestamp — it never hard-deletes
-- auth.users or any data row itself. The actual 30-day purge is a separate
-- operational/backend job outside this migration's and the UI's scope. When
-- set, the UI shows "Deletion scheduled for {date} — Cancel" instead of the
-- delete button; cancelling just clears it back to null.
--
-- Deliberately NOT adding columns for notification toggles or the "Public
-- recruiting page" toggle here — both reuse the existing
-- `user_settings.notification_preferences` JSONB bag (see
-- lib/supabase/settings-prefs.ts), the same shared-column, read-then-merge
-- pattern lib/supabase/design-preference.ts and lib/supabase/training.ts
-- already established, so no schema change is needed for those two.
--
-- NOT applied automatically — this file is tracked in git for review and
-- must be run against the real Supabase project by hand (dev and prod share
-- that project, so this isn't something to run unattended), same "011/013
-- discipline" as 011_outreach_stages.sql and 013_tournament_entries.sql.

alter table public.profiles add column if not exists home_area text;
alter table public.profiles add column if not exists utr_profile_link text;
alter table public.profiles add column if not exists gpa numeric(3, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_gpa_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_gpa_check
      check (gpa is null or (gpa >= 0 and gpa <= 5));
  end if;
end $$;

alter table public.profiles add column if not exists deletion_requested_at timestamptz;
