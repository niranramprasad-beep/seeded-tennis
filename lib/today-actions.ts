// Real, rules-based "things to do this week" for /today — no fabricated
// content. Every rule here reads from data that actually exists (real
// outreach status, real fit classification from lib/school-fit.ts); there is
// no "bad tournament to skip" rule because this app has no queryable source
// of upcoming tournament dates yet — see lib/tournament-fit.ts, which only
// scores a tournament a family types in by hand, not a live calendar.
import type { SchoolLite } from "@/lib/types";
import { classifySchoolFit, type SchoolFitProjectionInput } from "@/lib/school-fit";
import type { OutreachStatusMapDated } from "@/lib/db/outreach";
import { localDateKey } from "@/lib/time";

export type TodayActionKind = "email" | "followup" | "reminder";

export interface TodayAction {
  id: string;
  kind: TodayActionKind;
  school: SchoolLite;
  title: string;
  description: string;
  minutes: number;
}

// A contacted school with no reply reads as "due for a follow-up" after this
// many days — long enough that a normal reply window has passed, short
// enough that it's still useful for the player to see this week. Exported so
// /outreach's board (same follow-up-due concept, different rendering) uses
// the identical threshold instead of a second magic number.
export const FOLLOW_UP_AFTER_DAYS = 10;

export function daysSince(isoDate: string, now: Date = new Date()): number {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

export function buildTodayActions(
  playerUtr: number,
  targetSchools: SchoolLite[],
  outreach: OutreachStatusMapDated,
  now: Date = new Date(),
  projection?: SchoolFitProjectionInput
): TodayAction[] {
  const emails: TodayAction[] = [];
  const followups: TodayAction[] = [];
  const reminders: TodayAction[] = [];

  for (const school of targetSchools) {
    const entry = outreach[school.slug];
    const fit = classifySchoolFit(playerUtr, school, projection);

    if (!entry) {
      // Neither "reach" (not yet competitive) nor "out-of-range" (the gap
      // won't close in time at the player's real pace) is ready for a
      // coach email yet — only target/likely schools get the nudge.
      if (fit === "target" || fit === "likely") {
        emails.push({
          id: `email-${school.slug}`,
          kind: "email",
          school,
          title: `Email the ${school.shortName} coach`,
          description: `Your UTR (${playerUtr.toFixed(2)}) is inside ${school.shortName}'s competitive range.`,
          minutes: 10,
        });
      }
      continue;
    }

    if (entry.status === "emailed") {
      const days = daysSince(entry.updatedAt, now);
      if (days >= FOLLOW_UP_AFTER_DAYS) {
        followups.push({
          id: `followup-${school.slug}`,
          kind: "followup",
          school,
          title: `Follow up with ${school.shortName}`,
          description: `Sent ${days} days ago, no reply yet.`,
          minutes: 5,
        });
      }
    }

    // A player-set "remind me" check-in date (set from the Outreach board)
    // — only ever surfaces once it has actually arrived, never before, and
    // is independent of the automatic follow-up-due rule above.
    if (entry.remindAt && new Date(entry.remindAt).getTime() <= now.getTime()) {
      reminders.push({
        id: `reminder-${school.slug}`,
        kind: "reminder",
        school,
        title: `Check in on ${school.shortName}`,
        description: `You set a reminder to follow up with ${school.shortName}.`,
        minutes: 5,
      });
    }
  }

  const bySchoolName = (a: TodayAction, b: TodayAction) =>
    a.school.shortName.localeCompare(b.school.shortName);

  return [...emails.sort(bySchoolName), ...followups.sort(bySchoolName), ...reminders.sort(bySchoolName)];
}

export interface ThisWeekItem {
  id: string;
  label: string;
  day: string; // short weekday, e.g. "Thu"
  date: Date;
}

// The real, dated entries this card can honestly show today: follow-ups
// that are about to come due (not yet overdue — buildTodayActions already
// surfaces the overdue ones) and the standing weekly check-in. No entry-close
// dates: there's no real tournament-entry data source to pull them from.
export function buildThisWeekItems(
  targetSchools: SchoolLite[],
  outreach: OutreachStatusMapDated,
  now: Date = new Date()
): ThisWeekItem[] {
  const items: ThisWeekItem[] = [];
  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const school of targetSchools) {
    const entry = outreach[school.slug];
    if (entry?.status !== "emailed") continue;
    const dueDate = new Date(entry.updatedAt);
    dueDate.setDate(dueDate.getDate() + FOLLOW_UP_AFTER_DAYS);
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000);
    if (daysUntilDue >= 0 && daysUntilDue <= 7) {
      items.push({
        id: `due-${school.slug}`,
        label: `Follow-up due: ${school.shortName}`,
        day: WEEKDAY[dueDate.getDay()],
        date: dueDate,
      });
    }
  }

  // The real, standing weekly check-in — always due this coming Sunday.
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + ((7 - now.getDay()) % 7));
  items.push({
    id: "weekly-checkin",
    label: "Weekly check-in (2 min)",
    day: WEEKDAY[sunday.getDay()],
    date: sunday,
  });

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Real "haven't checked in this week" rule behind the Sunday check-in
// prompt (components/dashboard/sunday-checkin-drawer.tsx) — computed from
// the player's own most-recently-DATED real UTR entry (lib/db/plan.ts),
// never a fabricated streak. Due when either:
//   - it's actually Sunday and nothing has been logged yet today, or
//   - more than 7 days have passed since the last logged entry (genuinely
//     overdue regardless of weekday — covers a player who skipped a
//     Sunday or two, or who has never logged anything at all).
// Once an entry exists for today, it's satisfied no matter which rule
// would otherwise have triggered it — this is a once-a-day-at-most prompt,
// not a permanent nag.
export function isSundayCheckinDue(
  utrEntries: { recordedAt: string }[],
  now: Date = new Date()
): boolean {
  const todayKey = localDateKey(now);
  if (utrEntries.some((e) => e.recordedAt === todayKey)) return false;
  if (now.getDay() === 0) return true;
  if (utrEntries.length === 0) return true;

  const mostRecentKey = utrEntries.reduce(
    (latest, e) => (e.recordedAt > latest ? e.recordedAt : latest),
    utrEntries[0].recordedAt
  );
  // Date-only keys ("YYYY-MM-DD") must be parsed as LOCAL midnight, not UTC
  // midnight (same convention dashboard-view.tsx's actualPoints mapping
  // already uses for this exact field) — otherwise this can disagree with
  // `now.getDay()` above by up to a day depending on the player's timezone.
  const daysSinceLastEntry = Math.floor(
    (now.getTime() - new Date(`${mostRecentKey}T00:00:00`).getTime()) / 86_400_000
  );
  return daysSinceLastEntry > 7;
}
