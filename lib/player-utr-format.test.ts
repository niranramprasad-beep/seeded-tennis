import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatPlayerUtr, formatUTR, formatUtrEstimate, formatUtrFor, formatUtrOrNotTracked, utrInputValue } from "./utils";
import { buildCoachEmail } from "./db/schools";
import { explainSchoolFit } from "./school-fit";
import { emptyPlayer } from "./data/user";
import type { Player, School } from "./types";

// C10 (2026-11-18). A player's UTR of 5.95 printed as "6.0" on the school
// page, in the tournament checker and in the SUBJECT LINE of the coach email
// a minor sends: "UTR 6.0 (self-reported)". That is not rounding for
// display, it is a different rating sent to a coach under the player's name.
//
// One formatter for a player's own rating, always two decimals. Estimates
// (the projection to the summer before senior year, team ranges) keep one —
// docs/DECISIONS.md, 2026-11-18.

describe("formatPlayerUtr — always two decimals", () => {
  it.each([
    [5.95, "5.95"],
    [5.8, "5.80"],
    [9, "9.00"],
    [12.34, "12.34"],
    [16.5, "16.50"],
  ])("%s → %s", (v, out) => {
    expect(formatPlayerUtr(v)).toBe(out);
  });

  it("formatUTR is the same function (the old one turned 9 into '9.0' and 9.5 into '9.50')", () => {
    expect(formatUTR).toBe(formatPlayerUtr);
  });

  it("formatUtrOrNotTracked keeps its 'Not tracked' for no rating, two decimals otherwise", () => {
    expect(formatUtrOrNotTracked(0)).toBe("Not tracked");
    expect(formatUtrOrNotTracked(null)).toBe("Not tracked");
    expect(formatUtrOrNotTracked(5.95)).toBe("5.95");
  });

  it("an input starts at the chip's value, or empty — never '0.00' (C19)", () => {
    expect(utrInputValue(5.8)).toBe("5.80");
    expect(utrInputValue(0)).toBe("");
  });

  it("estimates keep one decimal, and formatUtrFor picks by what the number is", () => {
    expect(formatUtrEstimate(7.5)).toBe("7.5");
    expect(formatUtrFor(7.5, true)).toBe("7.5");
    expect(formatUtrFor(5.95, false)).toBe("5.95");
  });
});

const school = {
  id: "duke-men",
  slug: "duke-men",
  name: "Duke University",
  shortName: "Duke",
  division: "D1",
  conference: "ACC",
  gender: "men",
  minCompetitiveUTR: 12,
  avgRosterUTR: 13,
  usNewsRanking: 7,
  city: "Durham",
  state: "NC",
} as unknown as School;

describe("5.95 end to end", () => {
  const player: Player = { ...emptyPlayer, name: "Sam Fake", currentUTR: 5.95, graduationYear: 2029, gender: "male" };

  it("the coach email subject, body and signature say 5.95", () => {
    const email = buildCoachEmail(player, school);
    expect(email.subject).toContain("UTR 5.95 (self-reported)");
    expect(email.body).toContain("My UTR is 5.95 (self-reported).");
    expect(email.body).toContain("UTR 5.95 (self-reported) · Class of 2029");
    expect(`${email.subject}\n${email.body}`).not.toMatch(/\b6\.0\b|5\.9\b(?!5)/);
  });

  it("the school page's summary says 5.95", () => {
    const e = explainSchoolFit(5.95, school as never, { graduationYear: 2029, band: "reach" });
    expect(e.summary).toContain("5.95 today");
  });
});

/* ------------------------------------------------------------ the guard */

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

// Receivers that are a PLAYER's rating. `.toFixed(1)` on any of these rounds
// a real rating. Team fields (avgRosterUTR, minCompetitiveUTR, a range's
// min/max, a draw's average) are estimates and may keep one decimal.
// targetUTR / goalUTR / goal(.value): the plan goal is a rating the player
// CHOSE — a 9.25 printed "9.3" (lib/utr-projection.ts, reviewer finding).
const PLAYER_RATING = /\b(currentUTR|currentUtr|playerUtr|subjectUtr|utrNum|opponentUtr|shownUtr|effectiveUtr|hypotheticalUTR|goalUtr|goalUTR|targetUTR|targetUtr|goal|utr)\b/;
const TEAM_FIELD = /avgRosterUTR|minCompetitiveUTR|drawUtr|typicalFieldUtr|range\.(min|max)/;

/** The expression a `.toFixed(1)` is called on — back to the nearest
 *  delimiter that cannot be part of it. */
function receiverBefore(line: string, idx: number): string {
  let depth = 0;
  let i = idx - 1;
  for (; i >= 0; i--) {
    const c = line[i];
    if (c === ")" || c === "]") depth++;
    else if (c === "(" || c === "[") {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && /[\s{},;`$+\-*/?:=<>|&!]/.test(c)) break;
  }
  return line.slice(i + 1, idx);
}

describe("guard: no player rating is rounded to one decimal", () => {
  const files = ["app", "components", "lib"].flatMap((r) => sourceFiles(r));

  it("no `.toFixed(1)` on a player-rating expression in app code", () => {
    const offenders: string[] = [];
    for (const f of files) {
      stripComments(readFileSync(f, "utf8"))
        .split("\n")
        .forEach((line, n) => {
          for (const m of line.matchAll(/\.toFixed\(\s*1\s*\)/g)) {
            const recv = receiverBefore(line, m.index!);
            if (PLAYER_RATING.test(recv) && !TEAM_FIELD.test(recv)) offenders.push(`${f}:${n + 1} ${recv}.toFixed(1)`);
          }
        });
    }
    expect(offenders, "A player's rating goes through formatPlayerUtr (two decimals). Estimates use formatUtrEstimate.").toEqual([]);
  });

  it("the guard catches the shapes that shipped (mutation check)", () => {
    const shipped = [
      "const utr = `${player.currentUTR.toFixed(1)} (self-reported)`;",
      "value={utr.toFixed(1)}",
      ": utr || subjectUtr.toFixed(1);",
      "You're ${playerUtr.toFixed(1)} today",
      "today ${(subjectUtr as number).toFixed(1)}",
      "Your target is ${input.targetUTR.toFixed(1)}.",
      "Goal ${goal.value.toFixed(1)}",
      "your ${goalUTR.toFixed(1)} goal",
    ];
    for (const line of shipped) {
      const m = /\.toFixed\(\s*1\s*\)/.exec(line)!;
      const recv = receiverBefore(line, m.index);
      expect(PLAYER_RATING.test(recv) && !TEAM_FIELD.test(recv), line).toBe(true);
    }
    for (const ok of ["${school.minCompetitiveUTR.toFixed(1)}", "Team ${range.min.toFixed(1)}"]) {
      const m = /\.toFixed\(\s*1\s*\)/.exec(ok)!;
      const recv = receiverBefore(ok, m.index);
      expect(PLAYER_RATING.test(recv) && !TEAM_FIELD.test(recv), ok).toBe(false);
    }
  });

  it("buildCoachEmail never rounds: no toFixed or Math.round in its body, and it uses formatPlayerUtr", () => {
    const src = stripComments(readFileSync("lib/db/schools.ts", "utf8"));
    const start = src.indexOf("export function buildCoachEmail(");
    const end = src.indexOf("\nfunction ", start);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(start).toBeGreaterThan(-1);
    expect(body).toMatch(/formatPlayerUtr\(player\.currentUTR\)/);
    expect(body).not.toMatch(/toFixed|Math\.round|formatUtrEstimate/);
  });
});
