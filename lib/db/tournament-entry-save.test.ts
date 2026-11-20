import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* Production sweep C3: /tournament-fit → "Save to my events" saved nothing
 * and said nothing. These pin the save path end to end against a fake
 * Supabase client: the exact columns sent, that a new entry is an INSERT
 * (not an upsert), and that every failure reaches the caller as a plain-words
 * error instead of a null or a raw PostgREST message. */

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };
const calls: Call[] = [];
let nextResult: { data: unknown; error: { code?: string; message?: string } | null } = { data: null, error: null };
let authedUserId: string | null = "user-1";

function builder(table: string) {
  const call: Call = { table, op: "", filters: [] };
  calls.push(call);
  const b = {
    insert(payload: unknown) { call.op = "insert"; call.payload = payload; return b; },
    upsert(payload: unknown) { call.op = "upsert"; call.payload = payload; return b; },
    update(payload: unknown) { call.op = "update"; call.payload = payload; return b; },
    select() { if (!call.op) call.op = "select"; return b; },
    eq(col: string, v: unknown) { call.filters.push([col, v]); return b; },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => nextResult,
  };
  return b;
}

const fakeClient = {
  from: (table: string) => builder(table),
  rpc: (name: string) => {
    const result = { data: name === "my_family_code" ? "FAMCODE" : null, error: null };
    const q = { abortSignal: () => q, then: (r: (v: typeof result) => unknown) => Promise.resolve(result).then(r) };
    return q;
  },
};

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => fakeClient,
  getAuthedUser: async () => ({ data: { user: authedUserId ? { id: authedUserId } : null }, error: null }),
}));

const { saveTournamentEntry, buildTournamentEntryRow, tournamentSaveErrorMessage, TournamentSaveError, isCalendarDateKey } =
  await import("./events");

const input = {
  name: "  Spring Open  ",
  level: "L4" as const,
  eventDate: "2026-12-12",
  city: " Richmond ",
  state: " VA ",
  travelHours: 0.5,
  entryCost: 70,
  travelCost: null,
  distanceMiles: null,
  drawUtr: null,
  goalUtr: null,
};

const savedRow = {
  id: "row-1",
  user_id: "user-1",
  family_code: "FAMCODE",
  name: "Spring Open",
  level: "L4",
  event_date: "2026-12-12",
  city: "Richmond",
  state: "VA",
  travel_hours: 0.5,
  distance_miles: null,
  draw_utr: null,
  goal_utr: null,
  entry_cost: 70,
  travel_cost: null,
  status: "saved",
  created_at: "2026-11-18T00:00:00Z",
  updated_at: "2026-11-18T00:00:00Z",
};

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: savedRow, error: null };
  authedUserId = "user-1";
});

describe("buildTournamentEntryRow", () => {
  it("sends exactly the tournament_entries columns, trimmed, with no id on an insert", () => {
    const row = buildTournamentEntryRow(input, "user-1", "FAMCODE");
    expect(Object.keys(row).sort()).toEqual(
      [
        "user_id", "family_code", "name", "level", "event_date", "city", "state", "travel_hours",
        "distance_miles", "draw_utr", "goal_utr", "entry_cost", "travel_cost", "status",
      ].sort()
    );
    expect(row).toMatchObject({ name: "Spring Open", city: "Richmond", state: "VA", status: "saved", event_date: "2026-12-12" });
    expect("id" in row).toBe(false);
  });

  it("carries the id only for an update", () => {
    expect(buildTournamentEntryRow({ ...input, id: "row-9" }, "user-1", null)).toMatchObject({ id: "row-9" });
  });

  it("an edit without a status leaves the stored status alone (never resets Entered to Planning)", () => {
    expect("status" in buildTournamentEntryRow({ ...input, id: "row-9" }, "user-1", null)).toBe(false);
    expect(buildTournamentEntryRow({ ...input, id: "row-9", status: "played" }, "user-1", null)).toMatchObject({ status: "played" });
  });

  it("stores a blank city or state as NULL — both are optional", () => {
    const row = buildTournamentEntryRow({ ...input, city: "  ", state: undefined }, "user-1", null);
    expect(row.city).toBeNull();
    expect(row.state).toBeNull();
  });

  it("every column it sends exists in the generated tournament_entries Insert type", () => {
    const types = readFileSync(join(__dirname, "database.types.ts"), "utf8");
    const block = types.slice(types.indexOf("tournament_entries: {"));
    const insert = block.slice(block.indexOf("Insert: {"), block.indexOf("Update: {"));
    for (const col of Object.keys(buildTournamentEntryRow({ ...input, id: "x" }, "u", null))) {
      expect(insert, col).toMatch(new RegExp(`\\b${col}\\??:`));
    }
  });
});

describe("saveTournamentEntry", () => {
  it("inserts a new entry (never an upsert) and returns the mapped row", async () => {
    const saved = await saveTournamentEntry(input);
    const write = calls.find((c) => c.table === "tournament_entries");
    expect(write?.op).toBe("insert");
    expect(write?.payload).toMatchObject({ user_id: "user-1", family_code: "FAMCODE", name: "Spring Open" });
    expect(saved).toMatchObject({ id: "row-1", name: "Spring Open", eventDate: "2026-12-12", status: "saved" });
  });

  it("updates by id AND owner when an id is passed", async () => {
    await saveTournamentEntry({ ...input, id: "row-1" });
    const write = calls.find((c) => c.table === "tournament_entries");
    expect(write?.op).toBe("update");
    expect(write?.filters).toEqual([["id", "row-1"], ["user_id", "user-1"]]);
  });

  it("throws a plain-words error when the database refuses the row (RLS 42501)", async () => {
    nextResult = { data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "tournament_entries"' } };
    const err = await saveTournamentEntry(input).catch((e) => e);
    expect(err).toBeInstanceOf(TournamentSaveError);
    expect(err.message).not.toMatch(/row-level security|tournament_entries/);
    expect(err.message).toMatch(/couldn't save/i);
    expect(err.code).toBe("42501");
  });

  it("surfaces the rate limit (53400) as a wait-and-retry message", async () => {
    nextResult = { data: null, error: { code: "53400", message: "Too many changes at once. Try again later." } };
    await expect(saveTournamentEntry(input)).rejects.toThrow(/too many changes/i);
  });

  it("throws (never returns null) when nobody is signed in", async () => {
    authedUserId = null;
    await expect(saveTournamentEntry(input)).rejects.toThrow(/sign in/i);
    expect(calls.some((c) => c.table === "tournament_entries")).toBe(false);
  });

  it("rejects a blank date before any request is made", async () => {
    await expect(saveTournamentEntry({ ...input, eventDate: "" })).rejects.toThrow(/date/i);
    expect(calls.some((c) => c.table === "tournament_entries")).toBe(false);
  });
});

describe("tournamentSaveErrorMessage", () => {
  it("never echoes the raw database message", () => {
    for (const code of ["42501", "53400", "23514", "PGRST116", undefined]) {
      const msg = tournamentSaveErrorMessage({ code, message: "relation tournament_entries secret detail" });
      expect(msg).not.toMatch(/tournament_entries|relation|secret/);
      expect(msg.length).toBeGreaterThan(10);
    }
  });
});

describe("isCalendarDateKey", () => {
  it("accepts real YYYY-MM-DD dates only", () => {
    expect(isCalendarDateKey("2026-12-12")).toBe(true);
    expect(isCalendarDateKey("2028-02-29")).toBe(true);
    for (const bad of ["", "2026-02-30", "2026-13-01", "12/12/2026", "2026-1-1", "not-a-date"]) {
      expect(isCalendarDateKey(bad), bad).toBe(false);
    }
  });
});

describe("the Tournament Fit drawer", () => {
  const view = readFileSync(
    join(__dirname, "../../components/seeded/tournament-fit/seeded-tournament-fit-view.tsx"),
    "utf8"
  );

  it("starts the date blank — never today's date", () => {
    expect(view).toMatch(/useState\(""\);?\s*\n\s*const \[city/);
    expect(view).not.toMatch(/localDateKey\(\)/);
  });

  it("has no placeholder that looks like a real place or fee", () => {
    expect(view).not.toMatch(/placeholder="(Bethesda|MD|70|110)"/);
  });

  it("shows a save failure in the drawer instead of dropping it", () => {
    expect(view).toMatch(/setFormError\(/);
    expect(view).toMatch(/role="alert"/);
  });
});
