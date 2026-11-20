import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkTournamentFit,
  evaluateTournamentFit,
  FIELD_BANDS,
  fieldBand,
  LEVELS,
  NOT_ENOUGH_INFO,
  verdictBlockers,
  verdictBlockerSentence,
  type FitLevel,
} from "./tournament-fit";

/* Production sweep C15: the checker said "Worth it" with no fee entered
 * ("$0 / match"), judged a level nobody chose, and printed "avg 9.0" above a
 * verdict saying "players around 6–12".
 * PR D (D5): "L5 is typically competitive for 4.5–10.5" made almost
 * everything "Worth it", and that level table had no source. The verdict now
 * needs the draw's average UTR and is judged relative to the player. */

const base = { name: "x", goalUtr: null, travelHours: 0.5, distanceMiles: null, travelCost: null } as const;

describe("no verdict until the level, a UTR, the entry fee and the draw's average are in", () => {
  it("blocks on each missing input, in the form's order", () => {
    expect(verdictBlockers({ level: null, playerUtr: 5.95, entryCost: 70, drawUtr: 6 })).toEqual(["level"]);
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: null, drawUtr: 6 })).toEqual(["entry fee"]);
    expect(verdictBlockers({ level: "L4", playerUtr: null, entryCost: 70, drawUtr: 6 })).toEqual(["utr"]);
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: 70, drawUtr: null })).toEqual(["draw"]);
    expect(verdictBlockers({ level: null, playerUtr: null, entryCost: null, drawUtr: null })).toEqual([
      "level",
      "utr",
      "entry fee",
      "draw",
    ]);
  });

  it("treats a $0 fee as an answer (a free event), and a negative one as missing", () => {
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: 0, drawUtr: 6 })).toEqual([]);
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: -5, drawUtr: 6 })).toEqual(["entry fee"]);
    expect(verdictBlockers({ level: "L4", playerUtr: 5.95, entryCost: Number.NaN, drawUtr: 6 })).toEqual(["entry fee"]);
  });

  it("an out-of-range draw or player UTR (or the 0 sentinel) counts as missing", () => {
    expect(verdictBlockers({ level: "L4", playerUtr: 0, entryCost: 70, drawUtr: 6 })).toEqual(["utr"]);
    expect(verdictBlockers({ level: "L4", playerUtr: 6, entryCost: 70, drawUtr: 0.5 })).toEqual(["draw"]);
    expect(verdictBlockers({ level: "L4", playerUtr: 6, entryCost: 70, drawUtr: 17 })).toEqual(["draw"]);
  });

  it("asks for what is missing in plain words — and says 'Not enough info' when only the draw is", () => {
    expect(verdictBlockerSentence(["level", "entry fee"])).toBe("To see a verdict, choose the level and add the entry fee.");
    expect(verdictBlockerSentence(["entry fee"])).toBe("To see a verdict, add the entry fee.");
    expect(verdictBlockerSentence(["draw"])).toBe("Not enough info. Add the draw's average UTR for a real verdict.");
    expect(verdictBlockerSentence(["entry fee", "draw"])).toBe(
      "To see a verdict, add the entry fee and add the draw's average UTR."
    );
    expect(verdictBlockerSentence([])).toBe("");
  });

  it("checkTournamentFit returns null whenever anything is missing", () => {
    const row = { ...base, level: "L4" as FitLevel, playerUtr: 6, entryCost: 70, drawUtr: 6.2 };
    expect(checkTournamentFit(row)).not.toBeNull();
    expect(checkTournamentFit({ ...row, drawUtr: null })).toBeNull();
    expect(checkTournamentFit({ ...row, entryCost: null })).toBeNull();
    expect(checkTournamentFit({ ...row, playerUtr: null })).toBeNull();
    expect(checkTournamentFit({ ...row, level: null })).toBeNull();
  });

  it("the checker computes nothing while anything is missing", () => {
    const view = readFileSync(
      join(__dirname, "../components/seeded/tournament-fit/seeded-tournament-fit-view.tsx"),
      "utf8"
    );
    expect(view).toMatch(/blockers\.length > 0[^?]*\?\s*null/);
    // No level is pre-selected.
    expect(view).toMatch(/useState<FitLevel \| null>\(shared\.level \?\? null\)/);
    // "Add to my events" is disabled until there is a verdict (D7).
    expect(view).toMatch(/disabled=\{!result\}/);
  });
});

describe("no level-to-UTR table (D5: it had no source)", () => {
  it("the engine exports no typical-field range and the checker prints none", () => {
    const engine = readFileSync(join(__dirname, "tournament-fit.ts"), "utf8");
    expect(engine).not.toMatch(/LEVEL_UTR_WINDOW|typicalFieldRange/);
    const view = readFileSync(
      join(__dirname, "../components/seeded/tournament-fit/seeded-tournament-fit-view.tsx"),
      "utf8"
    );
    expect(view).not.toMatch(/Typical field/);
  });

  it("the level never changes the field verdict — only cost per match and travel forgiveness", () => {
    for (const l of LEVELS) {
      const r = evaluateTournamentFit({ ...base, level: l.value, playerUtr: 6, drawUtr: 6.4, entryCost: 0 });
      expect(r.fieldBand, l.value).toBe("in-range");
      expect(r.competitionScore, l.value).toBe(100);
    }
  });
});

describe("the field bands, relative to the player", () => {
  it("are the numbers /methodology prints — read from the engine, not retyped", () => {
    expect(FIELD_BANDS).toEqual({ inRange: { below: 0.5, above: 1.0 }, stretchAbove: 2.0, easyBelow: 1.5 });
    const section = readFileSync(
      join(__dirname, "../components/seeded/methodology/tournament-checker-section.tsx"),
      "utf8"
    );
    expect(section).toMatch(/import \{ FIELD_BANDS, LEVELS, NOT_ENOUGH_INFO \} from "@\/lib\/tournament-fit"/);
    // No band edge typed into the copy by hand.
    const copy = section.replace(/\/\/.*$/gm, "").replace(/className="[^"]*"/g, "");
    expect(copy).not.toMatch(/\b(0\.5|1\.0|1\.5|2\.0)\b/);
    const page = readFileSync(join(__dirname, "../components/seeded/methodology/seeded-methodology-view.tsx"), "utf8");
    expect(page).toMatch(/<TournamentCheckerMethod \/>/);
  });

  it("classify the gap at and around every edge", () => {
    const p = 6;
    expect(fieldBand(p + 2.01, p)).toBe("too-strong");
    expect(fieldBand(p + 2.0, p)).toBe("stretch");
    expect(fieldBand(p + 1.01, p)).toBe("stretch");
    expect(fieldBand(p + 1.0, p)).toBe("in-range");
    expect(fieldBand(p, p)).toBe("in-range");
    expect(fieldBand(p - 0.5, p)).toBe("in-range");
    expect(fieldBand(p - 0.51, p)).toBe("easy");
    expect(fieldBand(p - 1.5, p)).toBe("easy");
    expect(fieldBand(p - 1.51, p)).toBe("too-weak");
  });

  it("a cheap, local event can't rescue a field the player can't use", () => {
    const at = (drawUtr: number) =>
      evaluateTournamentFit({ ...base, level: "L5", playerUtr: 6, drawUtr, entryCost: 0 }).verdict;
    expect(at(6.2)).toBe("good");
    expect(at(7.5)).toBe("decent"); // stretch: Worth a look at best
    expect(at(5)).toBe("decent"); // a bit easy: Worth a look at best
    expect(at(8.5)).toBe("bad"); // too strong
    expect(at(4)).toBe("bad"); // too weak — this read "Worth it" before D5
  });

  it("prints the player's rating with two decimals", () => {
    const r = evaluateTournamentFit({ ...base, level: "L4", playerUtr: 5.95, drawUtr: 9, entryCost: 70 });
    expect(r.suggestions.join(" ")).toContain("your 5.95");
  });
});

/* Snapshot: three sample players (UTR 4, 6, 9) across L1–L7, with and
 * without a draw average. Fixed inputs otherwise: $120 entry, $150 travel
 * cost, 3 hours each way — so the level shows through cost per match and
 * travel forgiveness. A fixed draw average of 6.5 is in range for the 6,
 * far too strong for the 4 and far too weak for the 9: one table showing
 * the rule is about the player, not the level. */
describe("verdict snapshot — players 4 / 6 / 9 × L1–L7", () => {
  const players = [4, 6, 9];
  const levels: FitLevel[] = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"];
  const HEADLINE = { good: "Worth it", decent: "Worth a look", bad: "Skip it" } as const;

  function row(playerUtr: number, level: FitLevel, drawUtr: number | null) {
    const input = { ...base, travelHours: 3, travelCost: 150, level, playerUtr, drawUtr, entryCost: 120 };
    const fit = checkTournamentFit(input);
    if (!fit) {
      return `${playerUtr} ${level} draw=—   → ${verdictBlockerSentence(verdictBlockers(input))}`;
    }
    return `${playerUtr} ${level} draw=${drawUtr} → ${HEADLINE[fit.verdict]} (${fit.score}, ${fit.fieldBand})`;
  }

  it("without a draw average: never a verdict", () => {
    const rows = players.flatMap((p) => levels.map((l) => row(p, l, null)));
    for (const r of rows) expect(r).toContain(NOT_ENOUGH_INFO);
    expect(rows).toMatchSnapshot();
  });

  it("with a draw average of 6.5", () => {
    expect(players.flatMap((p) => levels.map((l) => row(p, l, 6.5)))).toMatchSnapshot();
  });

  it("with a draw average 0.5 above each player (in range)", () => {
    expect(players.flatMap((p) => levels.map((l) => row(p, l, p + 0.5)))).toMatchSnapshot();
  });

  it("with a draw average 1.5 above each player (a stretch: never better than Worth a look)", () => {
    const rows = players.flatMap((p) => levels.map((l) => row(p, l, p + 1.5)));
    for (const r of rows) expect(r).not.toContain("Worth it");
    expect(rows).toMatchSnapshot();
  });
});
