// What each dated thing in Seeded becomes in an .ics file (lib/ics.ts).
// Every field comes from something the player entered — the session's type,
// time, length and note; the tournament's name, date and place; the date on
// an outreach card — plus a link back to the page it lives on. No invented
// descriptions, no alarms.
import type { TrainingSession } from "@/lib/db/training";
import type { TournamentEntry } from "@/lib/db/events";
import { sessionType } from "@/lib/training/session-types";
import { toLocalDateString } from "@/lib/time";
import type { IcsEvent } from "./ics";

const SITE_URL = "https://seededtennis.com";

/** A LOCAL "YYYY-MM-DD" + "HH:MM" → the instant it names in this device's
 *  time zone — the zone the player typed it in. The builder writes it as
 *  UTC, which every calendar app shows back in the viewer's own zone. */
export function localDateTime(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function sessionIcsEvent(session: TrainingSession): IcsEvent {
  const start = localDateTime(session.date, session.startTime);
  const minutes = session.duration > 0 ? session.duration : 60;
  return {
    kind: "timed",
    id: `session-${session.id}`,
    summary: sessionType(session.typeId).label,
    description: session.notes || null,
    start,
    end: new Date(start.getTime() + minutes * 60_000),
    url: `${SITE_URL}/events`,
  };
}

export function tournamentIcsEvent(entry: TournamentEntry): IcsEvent {
  return {
    kind: "all-day",
    id: `tournament-${entry.id}`,
    summary: entry.name,
    date: entry.eventDate.slice(0, 10),
    location: [entry.city, entry.state].map((s) => s?.trim()).filter(Boolean).join(", ") || null,
    url: `${SITE_URL}/events`,
  };
}

/** The follow-up date an outreach card shows ("Reminder set for …" or
 *  "Follow up by …"), as an all-day event on that local day. */
export function outreachFollowUpIcsEvent(input: { schoolSlug: string; schoolName: string; date: Date }): IcsEvent {
  return {
    kind: "all-day",
    id: `outreach-follow-up-${input.schoolSlug}`,
    summary: `Follow up: ${input.schoolName}`,
    date: toLocalDateString(input.date),
    url: `${SITE_URL}/outreach`,
  };
}

/** Everything on the player's schedule from `today` (a local "YYYY-MM-DD")
 *  on: their sessions and saved tournaments, by date. */
export function upcomingScheduleIcsEvents(
  sessions: TrainingSession[],
  tournaments: TournamentEntry[],
  today: string = toLocalDateString()
): IcsEvent[] {
  const items: { key: string; event: IcsEvent }[] = [
    ...sessions
      .filter((s) => s.date >= today)
      .map((s) => ({ key: `${s.date}T${s.startTime}`, event: sessionIcsEvent(s) })),
    ...tournaments
      .filter((t) => t.eventDate.slice(0, 10) >= today)
      .map((t) => ({ key: `${t.eventDate.slice(0, 10)}T00:00`, event: tournamentIcsEvent(t) })),
  ];
  return items.sort((a, b) => a.key.localeCompare(b.key) || a.event.id.localeCompare(b.event.id)).map((i) => i.event);
}
