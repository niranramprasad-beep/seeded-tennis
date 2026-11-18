// Real, rules-based "things to do this week" for /today — no fabricated
// content. Every rule here reads from data that actually exists (real
// outreach status, real fit classification from lib/school-fit.ts); there is
// no "bad tournament to skip" rule because this app has no queryable source
// of upcoming tournament dates yet — see lib/tournament-fit.ts, which only
// scores a tournament a family types in by hand, not a live calendar.
import { formatPlayerUtr, plural } from "@/lib/utils";
import type { SchoolLite } from "@/lib/types";
import { classifySchoolFit,
  fitBasis, type SchoolFitProjectionInput } from "@/lib/school-fit";
import type { OutreachStatusMapDated } from "@/lib/db/outreach";
import { localDateKey, parseLocalDate } from "@/lib/time";

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
    const fit = classifySchoolFit(fitBasis(playerUtr, projection), school);

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
          description: `Your UTR (${formatPlayerUtr(playerUtr)}) is inside ${school.shortName}'s competitive range.`,
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
          description: `Sent ${plural(days, "day", "days")} ago, no reply yet.`,
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

/* --------------------------------------------------------- next steps (C12) */
// Today said "You're all caught up this week." beside "On track for 0 of 4
// targets", with an empty action list. Both were true to their own rule and
// together they told a player who is off track that there is nothing to do.
//
// These are the honest next steps when the coach-email rules above produce
// nothing, or the player is off track for some targets. Every one links to
// a feature that exists today — /schools, /events (log a result),
// /tournament-fit, the UTR drawer — and none promises anything Seeded does
// not do.

export interface NextStep {
  id: "log-utr" | "pick-targets" | "targets-in-range" | "log-result" | "check-tournament";
  title: string;
  description: string;
  cta: string;
  /** A page to go to. Absent for "log-utr", which opens the UTR drawer. */
  href?: string;
}

export interface NextStepsInput {
  hasUtr: boolean;
  targetCount: number;
  /** Targets whose band (from the fit report) is Target or Likely. */
  onTrackCount: number;
  matchesThisWeek: number;
  /** How many coach-email / follow-up actions buildTodayActions returned. */
  actionCount: number;
}

export const MAX_NEXT_STEPS = 3;

export function buildNextSteps(input: NextStepsInput): NextStep[] {
  const offTrack = input.targetCount > 0 && input.onTrackCount < input.targetCount;
  // Nothing to suggest when there are real actions and nothing is off.
  if (input.hasUtr && input.actionCount > 0 && !offTrack && input.targetCount > 0) return [];

  const steps: NextStep[] = [];
  if (!input.hasUtr) {
    steps.push({
      id: "log-utr",
      title: "Log your UTR",
      description: "Your bands, plan and checkpoints all start from it.",
      cta: "Log UTR",
    });
  }
  if (input.targetCount === 0) {
    steps.push({
      id: "pick-targets",
      title: "Pick a few target schools",
      description: "Star schools to see your fit and plan around them.",
      cta: "Browse schools",
      href: "/schools",
    });
  } else if (offTrack) {
    const behind = input.targetCount - input.onTrackCount;
    steps.push({
      id: "targets-in-range",
      title: "Add targets you're on track for",
      description: `${behind} of your ${plural(input.targetCount, "target", "targets")} ${behind === 1 ? "is" : "are"} a Reach or out of range. Add a few that fit where you're headed.`,
      cta: "Find schools",
      href: "/schools",
    });
  }
  if (input.matchesThisWeek === 0) {
    steps.push({
      id: "log-result",
      title: "Log a match result",
      description: "Results show your progress between UTR updates.",
      cta: "Log a result",
      href: "/events",
    });
  }
  steps.push({
    id: "check-tournament",
    title: "Check a tournament before you enter",
    description: "See whether a draw's level fits where you are now.",
    cta: "Check a tournament",
    href: "/tournament-fit",
  });
  return steps.slice(0, MAX_NEXT_STEPS);
}

/** The headline beside the action list — it must not say "caught up" while
 * the player is off track or has steps waiting. */
export function todayHeadline(actionCount: number, nextStepCount: number): string {
  if (actionCount > 0) return `${actionCount} thing${actionCount === 1 ? "" : "s"} move your recruiting this week.`;
  if (nextStepCount > 0) return `Here ${nextStepCount === 1 ? "is a next step" : `are ${nextStepCount} next steps`} for this week.`;
  return "You're all caught up this week.";
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
    (now.getTime() - parseLocalDate(mostRecentKey).getTime()) / 86_400_000
  );
  return daysSinceLastEntry > 7;
}
