-- Adds an optional free-text `reply_note` to coach_outreach so "Mark
-- replied" on the redesigned /outreach board can capture what a coach
-- actually said (e.g. "asked for fall video", "wants to see UTR hit 9.5")
-- instead of only flipping a status enum. Nullable, no default — most rows
-- will never set it, and that's fine: the board already reads "replied"
-- correctly from `status` alone, this is purely additive context.
--
-- A single nullable column was chosen over a separate notes table: there is
-- exactly one note per outreach row (the reply), not a running log, so a
-- second table would add a join for no real benefit. If this ever needs to
-- become a timestamped history of multiple notes, that's the point to split
-- it out.
--
-- NOT applied automatically — this file is tracked in git for review and
-- must be run against the real Supabase project by hand, same "011/013/
-- 014/015/016 discipline" as every other migration in this project.

alter table public.coach_outreach add column if not exists reply_note text;
