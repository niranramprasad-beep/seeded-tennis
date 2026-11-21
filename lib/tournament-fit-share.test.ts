import { describe, expect, it } from "vitest";
import {
  copyWithTimeout,
  costPerMatchNote,
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

  it("round-trips the draw's average UTR, and drops one out of range", () => {
    const encoded = encodeTournamentFitShareParams({ ...full, drawUtr: 9.75 });
    expect(encoded.get("draw")).toBe("9.75");
    expect(decodeTournamentFitShareParams(encoded).drawUtr).toBeCloseTo(9.75, 5);
    expect(encodeTournamentFitShareParams(full).has("draw")).toBe(false);
    expect(decodeTournamentFitShareParams(new URLSearchParams({ draw: "0.2" })).drawUtr).toBeUndefined();
    expect(decodeTournamentFitShareParams(new URLSearchParams({ draw: "abc" })).drawUtr).toBeUndefined();
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

describe("copyWithTimeout (final-check B12)", () => {
  it("reports a successful copy", async () => {
    await expect(copyWithTimeout(async () => {}, "x")).resolves.toBe("copied");
  });
  it("reports a refused copy", async () => {
    await expect(copyWithTimeout(async () => Promise.reject(new Error("denied")), "x")).resolves.toBe("failed");
  });
  it("never hangs on a clipboard that does not answer", async () => {
    await expect(copyWithTimeout(() => new Promise<void>(() => {}), "x", 20)).resolves.toBe("failed");
  });
  it("fails without a clipboard API", async () => {
    await expect(copyWithTimeout(undefined, "x")).resolves.toBe("failed");
  });
});

describe("costPerMatchNote (final-check A17)", () => {
  it("names the match assumption and the total", () => {
    expect(costPerMatchNote(3, 95)).toBe("Assumes ~3 matches at this level · $95 total");
  });
});
