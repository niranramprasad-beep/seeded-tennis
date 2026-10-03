import type { Tournament } from "@/lib/types";
import { localDateKey } from "@/lib/time";

// Sample USTA junior tournament calendar, weighted toward the Mid-Atlantic /
// DC section to match the target market. Levels run L1 (national, most
// competitive) through L7 (entry-level sectional).
//
// Dates are generated relative to "today" (via dayOffset) rather than
// hardcoded, so the calendar never goes stale — there's always a mix of
// recently-completed, registered, and upcoming events, no matter when this
// runs. Status is derived from the offset, never set independently of it.

interface TournamentTemplate {
  id: string;
  name: string;
  level: Tournament["level"];
  city: string;
  state: string;
  surface: Tournament["surface"];
  dayOffset: number; // negative = in the past, positive = upcoming
  result?: string;
  /** Only meaningful for future events; signals "I've registered" vs. just on the calendar. */
  registered?: boolean;
}

const TEMPLATES: TournamentTemplate[] = [
  {
    id: "t-01",
    name: "Mid-Atlantic Open",
    level: "L4",
    city: "Rockville",
    state: "MD",
    surface: "Indoor",
    dayOffset: -120,
    result: "Quarterfinal",
  },
  {
    id: "t-02",
    name: "Maryland Spring Junior Open",
    level: "L5",
    city: "College Park",
    state: "MD",
    surface: "Hard",
    dayOffset: -90,
    result: "Semifinal",
  },
  {
    id: "t-03",
    name: "Mid-Atlantic Closed Championships",
    level: "L3",
    city: "Richmond",
    state: "VA",
    surface: "Hard",
    dayOffset: -60,
    result: "Round of 16",
  },
  {
    id: "t-04",
    name: "DC Junior Classic",
    level: "L6",
    city: "Washington",
    state: "DC",
    surface: "Hard",
    dayOffset: -30,
    result: "Champion",
  },
  {
    id: "t-05",
    name: "USTA National Spring Championships",
    level: "L2",
    city: "Mobile",
    state: "AL",
    surface: "Hard",
    dayOffset: 20,
    registered: true,
  },
  {
    id: "t-06",
    name: "Virginia Summer Open",
    level: "L4",
    city: "Charlottesville",
    state: "VA",
    surface: "Clay",
    dayOffset: 40,
    registered: true,
  },
  {
    id: "t-07",
    name: "Mid-Atlantic Summer Championships",
    level: "L3",
    city: "Fairfax",
    state: "VA",
    surface: "Hard",
    dayOffset: 70,
  },
  {
    id: "t-08",
    name: "USTA National Hardcourt Championships",
    level: "L1",
    city: "San Diego",
    state: "CA",
    surface: "Hard",
    dayOffset: 100,
  },
  {
    id: "t-09",
    name: "Bethesda Junior Open",
    level: "L5",
    city: "Bethesda",
    state: "MD",
    surface: "Hard",
    dayOffset: 130,
  },
  {
    id: "t-10",
    name: "Maryland Fall Classic",
    level: "L4",
    city: "Baltimore",
    state: "MD",
    surface: "Indoor",
    dayOffset: 160,
  },
];

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toISODate(date: Date): string {
  return localDateKey(date);
}

export function buildTournaments(today: Date = new Date()): Tournament[] {
  return TEMPLATES.map((t) => {
    const status: Tournament["status"] =
      t.dayOffset < 0 ? "completed" : t.registered ? "registered" : "upcoming";
    return {
      id: t.id,
      name: t.name,
      level: t.level,
      date: toISODate(addDays(today, t.dayOffset)),
      city: t.city,
      state: t.state,
      surface: t.surface,
      status,
      result: status === "completed" ? t.result : undefined,
    };
  });
}
