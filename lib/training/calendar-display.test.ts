import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatClockTime, GRID_HOURS, hourLabel } from "./grid-math";

/* PR D, D4 + D7: session times read like the axis beside them ("4:00 pm",
 * not "16:00"); saved tournaments sit on the calendar as all-day items; and
 * deleting a session or a tournament offers Undo, like a result. */

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("session times use the axis's format", () => {
  it("formats a stored HH:MM start", () => {
    expect(formatClockTime("16:00")).toBe("4:00 pm");
    expect(formatClockTime("09:30")).toBe("9:30 am");
    expect(formatClockTime("12:15")).toBe("12:15 pm");
    expect(formatClockTime("00:45")).toBe("12:45 am");
    expect(formatClockTime("21:05:00")).toBe("9:05 pm");
    expect(formatClockTime("nonsense")).toBe("nonsense");
    expect(formatClockTime("25:00")).toBe("25:00");
  });

  it("the axis and the sessions share one am/pm style", () => {
    expect(GRID_HOURS.map(hourLabel)).toContain("4 pm");
    expect(hourLabel(12)).toBe("12 pm");
    expect(hourLabel(6)).toBe("6 am");
    for (const h of GRID_HOURS) {
      const t = `${String(h).padStart(2, "0")}:00`;
      expect(formatClockTime(t)).toBe(hourLabel(h).replace(" ", ":00 "));
    }
  });

  it("the calendar never prints a raw stored start time", () => {
    const src = read("components/seeded/events/events-calendar-card.tsx");
    expect(src).not.toMatch(/\{session\.startTime\}|\$\{s\.startTime\}|\$\{session\.startTime\}/);
  });
});

describe("tournaments on the calendar", () => {
  it("week (grid and phone list) and month views all draw saved tournaments as all-day items", () => {
    const src = read("components/seeded/events/events-calendar-card.tsx");
    expect(src).toMatch(/All day/);
    expect(src.match(/tournamentsByDate=\{tournamentsByDate\}/g)?.length).toBe(3);
  });
});

describe("delete offers Undo — sessions, tournaments, results", () => {
  it("each delete path sets an Undo action that restores the same record", () => {
    const hook = read("lib/hooks/use-events-calendar.ts");
    expect(hook).toMatch(/action: \{ label: "Undo"/);
    expect(hook).toMatch(/createTrainingSessions\(toRestore\)/);

    const events = read("components/seeded/events/events-inner.tsx");
    expect(events).toMatch(/action: \{ label: "Undo", onClick: \(\) => void restoreTournament\(entry\) \}/);
    expect(events).toMatch(/restoreTournamentEntry\(entry\)/);

    const results = read("components/matches/match-history-view.tsx");
    expect(results).toMatch(/action: \{ label: "Undo"/);
  });
});
