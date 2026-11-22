import { describe, expect, it } from "vitest";
import type { TrainingSession } from "@/lib/db/training";
import type { TournamentEntry } from "@/lib/db/events";
import { buildIcsCalendar } from "./ics";
import {
  localDateTime,
  outreachFollowUpIcsEvent,
  sessionIcsEvent,
  tournamentIcsEvent,
  upcomingScheduleIcsEvents,
} from "./ics-items";

// What each dated thing in Seeded puts in an .ics file: only what the player
// entered, plus a link back to the page. Clearly-fake fixtures only.

const session = (over: Partial<TrainingSession> = {}): TrainingSession => ({
  id: "11111111-1111-4111-8111-111111111111",
  date: "2026-11-24",
  startTime: "16:30",
  duration: 90,
  typeId: "strength",
  notes: "",
  seriesId: null,
  ...over,
});

const tournament = (over: Partial<TournamentEntry> = {}): TournamentEntry => ({
  id: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  name: "Example Fall Open",
  level: "L6" as TournamentEntry["level"],
  eventDate: "2026-11-28",
  city: "",
  state: "",
  travelHours: null,
  distanceMiles: null,
  drawUtr: null,
  goalUtr: null,
  entryCost: null,
  travelCost: null,
  status: "saved",
  createdAt: "2026-11-01T00:00:00Z",
  ...over,
});

describe("sessionIcsEvent", () => {
  it("is a timed event at the session's LOCAL date and time, for its length", () => {
    const e = sessionIcsEvent(session());
    if (e.kind !== "timed") throw new Error("expected timed");
    expect(e.start.getTime()).toBe(new Date(2026, 10, 24, 16, 30).getTime());
    expect(e.end.getTime() - e.start.getTime()).toBe(90 * 60_000);
  });

  it("is titled by the session's type and carries the player's note, and nothing else", () => {
    const withNote = sessionIcsEvent(session({ notes: "Serve + volley" }));
    expect(withNote.summary).toBe("Strength");
    expect(withNote.description).toBe("Serve + volley");
    expect(withNote.location ?? null).toBeNull();
    expect(sessionIcsEvent(session()).description).toBeNull();
    expect(withNote.url).toBe("https://seededtennis.com/events");
  });

  it("has a UID from the session's id", () => {
    expect(sessionIcsEvent(session()).id).toBe("session-11111111-1111-4111-8111-111111111111");
  });

  it("round-trips through the builder in UTC", () => {
    const ics = buildIcsCalendar([sessionIcsEvent(session())], { now: new Date(Date.UTC(2026, 10, 22)) });
    const start = new Date(2026, 10, 24, 16, 30);
    const stamp = start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    expect(ics).toContain(`DTSTART:${stamp}\r\n`);
  });
});

describe("localDateTime", () => {
  it("reads the date and time as this device's local time", () => {
    expect(localDateTime("2026-03-08", "09:05").getTime()).toBe(new Date(2026, 2, 8, 9, 5).getTime());
  });
});

describe("tournamentIcsEvent", () => {
  it("is an all-day event on the entry's date with its name", () => {
    const e = tournamentIcsEvent(tournament());
    expect(e).toMatchObject({ kind: "all-day", date: "2026-11-28", summary: "Example Fall Open" });
    expect(e.id).toBe("tournament-22222222-2222-4222-8222-222222222222");
  });

  it("uses the city and state the player typed as the location, or none", () => {
    expect(tournamentIcsEvent(tournament({ city: "Springfield", state: "IL" })).location).toBe("Springfield, IL");
    expect(tournamentIcsEvent(tournament({ city: "", state: "IL" })).location).toBe("IL");
    expect(tournamentIcsEvent(tournament()).location).toBeNull();
  });

  it("does not put fit verdicts, costs or levels in the file", () => {
    const ics = buildIcsCalendar([tournamentIcsEvent(tournament({ entryCost: 85, drawUtr: 9.1 }))], {
      now: new Date(Date.UTC(2026, 10, 22)),
    });
    expect(ics).not.toMatch(/85|9\.1|L6|Worth|Skip/);
    expect(ics).not.toContain("DESCRIPTION");
  });
});

describe("outreachFollowUpIcsEvent", () => {
  it("is an all-day event on the follow-up's local day, with a stable per-school UID", () => {
    const date = new Date(2026, 11, 3, 15, 0);
    const e = outreachFollowUpIcsEvent({ schoolSlug: "example-state", schoolName: "Example State", date });
    expect(e).toMatchObject({ kind: "all-day", date: "2026-12-03", summary: "Follow up: Example State" });
    expect(e.id).toBe("outreach-follow-up-example-state");
    expect(e.url).toBe("https://seededtennis.com/outreach");
  });
});

describe("upcomingScheduleIcsEvents", () => {
  it("keeps only items from today on, sorted by date then time", () => {
    const events = upcomingScheduleIcsEvents(
      [
        session({ id: "past", date: "2026-11-20" }),
        session({ id: "late", date: "2026-11-28", startTime: "18:00" }),
        session({ id: "today", date: "2026-11-22", startTime: "07:00" }),
      ],
      [tournament({ id: "t-old", eventDate: "2026-11-01" }), tournament({ id: "t1", eventDate: "2026-11-28" })],
      "2026-11-22"
    );
    expect(events.map((e) => e.id)).toEqual(["session-today", "tournament-t1", "session-late"]);
  });

  it("is empty when nothing is ahead", () => {
    expect(upcomingScheduleIcsEvents([session({ date: "2026-01-01" })], [], "2026-11-22")).toEqual([]);
  });
});
