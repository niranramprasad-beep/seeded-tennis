import { describe, expect, it } from "vitest";
import {
  decodeTournamentFitShareParams,
  encodeTournamentFitShareParams,
  travelHoursForPill,
  type ShareableFitState,
} from "./tournament-fit-share";

const full: ShareableFitState = {
  name: "USTA L5 Bethesda Open",
  level: "L5",
  playerUtr: 9.4,
  travel: "short",
  entryCost: 70,
  travelCost: 110,
};

describe("encodeTournamentFitShareParams / decodeTournamentFitShareParams", () => {
  it("round-trips a fully populated state", () => {
    const encoded = encodeTournamentFitShareParams(full);
    const decoded = decodeTournamentFitShareParams(encoded);
    expect(decoded.name).toBe(full.name);
    expect(decoded.level).toBe(full.level);
    expect(decoded.playerUtr).toBeCloseTo(full.playerUtr!, 5);
    expect(decoded.travel).toBe(full.travel);
    expect(decoded.entryCost).toBe(full.entryCost);
    expect(decoded.travelCost).toBe(full.travelCost);
  });

  it("omits empty/null optional fields from the query string", () => {
    const encoded = encodeTournamentFitShareParams({
      name: "",
      level: "L4",
      playerUtr: null,
      travel: "local",
      entryCost: null,
      travelCost: null,
    });
    expect(encoded.has("name")).toBe(false);
    expect(encoded.has("utr")).toBe(false);
    expect(encoded.has("entry")).toBe(false);
    expect(encoded.has("travelCost")).toBe(false);
    // Level and travel always have a concrete value, so they're always set.
    expect(encoded.get("level")).toBe("L4");
    expect(encoded.get("travel")).toBe("local");
  });

  it("trims and length-caps a shared tournament name", () => {
    const params = new URLSearchParams({ name: `  ${"x".repeat(250)}  `, level: "L4" });
    const decoded = decodeTournamentFitShareParams(params);
    expect(decoded.name?.length).toBe(200);
    expect(decoded.name?.startsWith("x")).toBe(true);
  });

  it("drops an unknown level rather than guessing one", () => {
    const params = new URLSearchParams({ level: "L99" });
    const decoded = decodeTournamentFitShareParams(params);
    expect(decoded.level).toBeUndefined();
  });

  it("drops an out-of-range UTR instead of clamping it silently", () => {
    const params = new URLSearchParams({ utr: "99" });
    const decoded = decodeTournamentFitShareParams(params);
    expect(decoded.playerUtr).toBeUndefined();
  });

  it("drops a non-numeric UTR", () => {
    const params = new URLSearchParams({ utr: "not-a-number" });
    const decoded = decodeTournamentFitShareParams(params);
    expect(decoded.playerUtr).toBeUndefined();
  });

  it("drops an unknown travel pill rather than guessing one", () => {
    const params = new URLSearchParams({ travel: "by-boat" });
    const decoded = decodeTournamentFitShareParams(params);
    expect(decoded.travel).toBeUndefined();
  });

  it("drops a negative cost", () => {
    const params = new URLSearchParams({ entry: "-5", travelCost: "-1" });
    const decoded = decodeTournamentFitShareParams(params);
    expect(decoded.entryCost).toBeUndefined();
    expect(decoded.travelCost).toBeUndefined();
  });

  it("returns an empty object for an empty query string", () => {
    expect(decodeTournamentFitShareParams(new URLSearchParams())).toEqual({});
  });
});

describe("travelHoursForPill", () => {
  it("maps each pill to an increasing, documented hours figure", () => {
    const local = travelHoursForPill("local");
    const short = travelHoursForPill("short");
    const overnight = travelHoursForPill("overnight");
    expect(local).toBeLessThan(short);
    expect(short).toBeLessThan(overnight);
  });
});
