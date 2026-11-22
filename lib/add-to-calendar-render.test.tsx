import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TournamentEntry } from "@/lib/db/events";
import type { TrainingSession } from "@/lib/db/training";
import { AddToCalendarButton } from "@/components/seeded/ui/add-to-calendar-button";
import { UpcomingTournamentsCard } from "@/components/seeded/events/upcoming-tournaments-card";
import { EventsCalendarCard } from "@/components/seeded/events/events-calendar-card";
import { toLocalDateString } from "./time";
import type { IcsEvent } from "./ics";

// "Add to calendar", rendered: the button says exactly that, is disabled
// with nothing to add, and appears once per saved tournament and once for
// the whole schedule. (The download itself is lib/ics.test.ts's job.)

const noop = () => {};

const event: IcsEvent = { kind: "all-day", id: "t", summary: "Example Open", date: "2026-11-28" };

const entry = (id: string, name: string, eventDate: string): TournamentEntry => ({
  id,
  userId: "u",
  name,
  level: "L6",
  eventDate,
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
});

const count = (html: string, text: string) => html.split(text).length - 1;

describe("AddToCalendarButton", () => {
  it("reads 'Add to calendar' and is a real button", () => {
    const html = renderToStaticMarkup(createElement(AddToCalendarButton, { events: [event], filename: "x" }));
    expect(html).toMatch(/^<button[^>]*type="button"/);
    expect(html).toContain("Add to calendar");
    expect(html).not.toMatch(/\sdisabled=""/);
  });

  it("is disabled when there is nothing to add", () => {
    const html = renderToStaticMarkup(createElement(AddToCalendarButton, { events: [], filename: "x" }));
    expect(html).toMatch(/\sdisabled=""/);
  });

  it("keeps the visible text at the start of a longer accessible name", () => {
    const html = renderToStaticMarkup(
      createElement(AddToCalendarButton, { events: [event], filename: "x", label: "Add to calendar: Example Open" })
    );
    expect(html).toContain('aria-label="Add to calendar: Example Open"');
  });
});

describe("Upcoming tournaments card", () => {
  it("offers Add to calendar on every saved tournament, named for it", () => {
    const html = renderToStaticMarkup(
      createElement(UpcomingTournamentsCard, {
        entries: [entry("a", "Example Fall Open", "2026-11-28"), entry("b", "Example Winter Cup", "2026-12-12")],
        playerUtr: 0,
        onSetStatus: noop,
        onEdit: noop,
        onRemove: noop,
      })
    );
    expect(count(html, ">Add to calendar<")).toBe(2);
    expect(html).toContain('aria-label="Add to calendar: Example Fall Open"');
    expect(html).toContain('aria-label="Add to calendar: Example Winter Cup"');
  });

  it("shows none when there are no tournaments", () => {
    const html = renderToStaticMarkup(
      createElement(UpcomingTournamentsCard, { entries: [], playerUtr: 0, onSetStatus: noop, onEdit: noop, onRemove: noop })
    );
    expect(html).not.toContain("Add to calendar");
  });
});

describe("Schedule card", () => {
  const props = { onAdd: noop, onEdit: noop, onOpenTournament: noop, onMove: noop, onResize: noop };
  const future = new Date();
  future.setDate(future.getDate() + 3);
  const session: TrainingSession = {
    id: "s1",
    date: toLocalDateString(future),
    startTime: "16:00",
    duration: 60,
    typeId: "tennis",
    notes: "",
    seriesId: null,
  };
  const exportAll = /<button[^>]*aria-label="Add to calendar: every upcoming session and tournament"[^>]*>/;

  it("has one Add to calendar for the whole upcoming schedule", () => {
    const html = renderToStaticMarkup(createElement(EventsCalendarCard, { ...props, sessions: [session], tournamentEntries: [] }));
    const button = html.match(exportAll)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toMatch(/\sdisabled=""/);
  });

  it("disables it when nothing is ahead", () => {
    const html = renderToStaticMarkup(createElement(EventsCalendarCard, { ...props, sessions: [], tournamentEntries: [] }));
    expect(html.match(exportAll)?.[0]).toMatch(/\sdisabled=""/);
  });
});
