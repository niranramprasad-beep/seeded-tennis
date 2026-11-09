-- Widens coach_outreach from 2 stages (contacted/replied) to the 6-stage
-- pipeline the redesigned /outreach board needs: researching, emailed,
-- replied, call_visit, offer, committed. Existing rows are remapped
-- losslessly — contacted -> emailed (that's what "contacted" always meant
-- here: an email was sent), replied stays replied. No row is dropped.
--
-- NOT applied automatically — this file is tracked in git for review and
-- must be run against the real Supabase project by hand (dev and prod share
-- that project, so this isn't something to run unattended).
--
-- Also adds the updated_at trigger this table was missing: every other
-- tracked table gets one (see 002_utr_entries.sql), but 009_coach_outreach
-- never added one, so `updated_at` only reflected a row's original INSERT
-- time, never a later status change via upsert. The new /today and
-- /outreach follow-up-due logic both depend on updated_at meaning "when did
-- this status last change," so this is a real fix, not just schema widening.
--
-- Also adds `remind_at`, nullable, for the real "Remind me in 14 days"
-- action on /outreach: a player can set a future check-in date on any row,
-- and /today surfaces it as a due action once that date arrives. Null by
-- default (no reminder set) — this is not the same signal as the
-- follow-up-due logic above, which is derived from updated_at, not stored.

update public.coach_outreach set status = 'emailed' where status = 'contacted';

alter table public.coach_outreach drop constraint if exists coach_outreach_status_check;
alter table public.coach_outreach
  add constraint coach_outreach_status_check
  check (status in ('researching', 'emailed', 'replied', 'call_visit', 'offer', 'committed'));

drop trigger if exists coach_outreach_set_updated_at on public.coach_outreach;
create trigger coach_outreach_set_updated_at
before update on public.coach_outreach
for each row
execute function public.set_updated_at();

alter table public.coach_outreach add column if not exists remind_at timestamptz;
