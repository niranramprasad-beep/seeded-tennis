import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateTournamentFit,
  LEVELS,
  typicalFieldRange,
  verdictBlockers,
  verdictBlockerSentence,
} from "./tournament-fit";

/* Production sweep C15: the checker said "Worth it" with no fee entered
 * ("$0 / match"), judged a level nobody chose, and printed "avg 9.0" above a
 * verdict saying "players around 6–12". */

describe("no verdict until the level and the entry fee are in", () => {
  it("blocks on a missing level, rating or entry fee", () => {
    expect(verdictBlockers({ level: null, playerUtr: 5.95, entryCost: 70 })).toEqual(["level"]);
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: null })).toEqual(["entry fee"]);
    expect(verdictBlockers({ level: "L4", playerUtr: null, entryCost: 70 })).toEqual(["utr"]);
    expect(verdictBlockers({ level: null, playerUtr: null, entryCost: null })).toEqual(["level", "utr", "entry fee"]);
  });

  it("treats a $0 fee as an answer (a free event), and a negative one as missing", () => {
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: 0 })).toEqual([]);
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: -5 })).toEqual(["entry fee"]);
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: Number.NaN })).toEqual(["entry fee"]);
  });

  it("asks for what is missing in plain words", () => {
    expect(verdictBlockerSentence(["level", "entry fee"])).toBe("To see a verdict, choose the level and add the entry fee.");
    expect(verdictBlockerSentence(["entry fee"])).toBe("To see a verdict, add the entry fee.");
    expect(verdictBlockerSentence([])).toBe("");
  });

  it("the checker computes nothing while anything is missing", () => {
    const view = readFileSync(
      join(__dirname, "../components/seeded/tournament-fit/seeded-tournament-fit-view.tsx"),
      "utf8"
    );
    expect(view).toMatch(/blockers\.length > 0[^?]*\?\s*null/);
    // No level is pre-selected.
    expect(view).toMatch(/useState<FitLevel \| null>\(shared\.level \?\? null\)/);
  });
});

describe("one field estimate, printed the same way everywhere", () => {
  it("the verdict sentence quotes typicalFieldRange()'s label", () => {
    for (const l of LEVELS.filter((x) => x.value !== "utr")) {
      const { low, high, label } = typicalFieldRange(l.value);
      const mid = (low + high) / 2;
      const r = evaluateTournamentFit({
        name: "x", level: l.value, playerUtr: mid, goalUtr: null, drawUtr: null,
        travelHours: 0.5, distanceMiles: null, entryCost: 50, travelCost: null,
      });
      expect(r.reasons[0].text, l.value).toContain(`players around UTR ${label}`);
    }
  });

  it("below or above the window, the sentence quotes the same range", () => {
    const at = (playerUtr: number) =>
      evaluateTournamentFit({
        name: "x", level: "L4", playerUtr, goalUtr: null, drawUtr: null,
        travelHours: 0.5, distanceMiles: null, entryCost: 70, travelCost: null,
      }).reasons[0];
    for (const u of [5.95, 3.0, 12.3, 14.5]) expect(at(u).text, String(u)).toContain("UTR 6–12");
    // 0.05 under the window is the edge of the range, not "a big step up".
    expect(at(5.95).text).toMatch(/just under/);
    expect(at(5.95).tone).toBe("neutral");
    expect(at(3.0).text).toMatch(/big step up/);
  });

  it("L4 reads 6–12, not a midpoint", () => {
    expect(typicalFieldRange("L4").label).toBe("6–12");
  });

  it("prints the player's rating with two decimals", () => {
    const r = evaluateTournamentFit({
      name: "x", level: "L4", playerUtr: 5.95, goalUtr: null, drawUtr: null,
      travelHours: 0.5, distanceMiles: null, entryCost: 70, travelCost: null,
    });
    expect(r.reasons.map((x) => x.text).join(" ")).toContain("5.95");
    expect(r.reasons.map((x) => x.text).join(" ")).not.toContain("6.0,");
  });
});
