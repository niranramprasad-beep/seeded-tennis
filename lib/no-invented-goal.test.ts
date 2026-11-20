import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { emptyPlayer } from "@/lib/data/user";

// CLAUDE.md, non-negotiable: "No generated or made-up data, anywhere."
//
// Until migration 049 every Seeded account carried `tournaments_goal = 12`
// and `tournaments_played = 0` that nobody typed: sign-up wrote the 12
// (lib/auth.ts twice, signup-flow.tsx), emptyPlayer carried it, every save
// round-tripped it, the legacy parent dashboard drew "0/12" with a progress
// bar, and the cost calculator multiplied by it. Production: 8 of 8 profiles
// = 12/0 on 2026-11-20.
//
// Now the count is `Player.tournamentsPlanned: number | null` — the
// player's answer or "Not set" — and "played this season" is counted from
// tournament_entries (lib/tournaments-planned.ts). This file fails the build
// if the invented number, the old names, or a profile read of the played
// count comes back. It is a source scan: a lint, not a proof. The
// self-tests at the bottom are the mutation tests.

const ROOTS = ["components", "app", "lib"];
const EXTS = [".ts", ".tsx"];
/** Not live code: dev-only previews, and the generated database types
 * (which must keep naming the real columns). */
const SKIP = [join("components", "dev"), join("lib", "db", "database.types.ts")];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (SKIP.some((s) => full === s || full.startsWith(s + "/"))) continue;
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (EXTS.some((e) => entry.endsWith(e)) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

// Comments quote the old names deliberately (the history is the defence),
// so only live code is scanned. Line comments are only stripped when the
// `//` starts the line or follows whitespace — a `//` inside a URL string
// ("https://…") must not swallow the code after it.
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

const FILES = sourceFiles(ROOTS[0]).concat(sourceFiles(ROOTS[1]), sourceFiles(ROOTS[2]));

export interface Rule {
  why: string;
  pattern: RegExp;
}

/** Every rule applies to every live file. */
export const RULES: Rule[] = [
  {
    why: "`tournamentsGoal` is gone — the field is `tournamentsPlanned: number | null` (049)",
    pattern: /\btournamentsGoal\b/,
  },
  {
    why: "a literal tournaments_goal is the invented default coming back (049)",
    pattern: /\btournaments_goal\s*:\s*\d/,
  },
  {
    why: "a literal tournamentsPlanned is a default count nobody typed — use null (Not set)",
    pattern: /\btournamentsPlanned\s*:\s*\d/,
  },
  {
    why: "a fallback number for the planned count invents one — show Not set instead",
    pattern: /\btournaments\w*\s*(?:\?\?|\|\|)\s*\d/i,
  },
  {
    why: "`?? 12` on a tournaments line is the old invented default",
    pattern: /tournament[^\n]*\?\?\s*12\b|\?\?\s*12\b[^\n]*tournament/i,
  },
  {
    why: "tournamentsPlayed is gone: played is counted from tournament_entries marked Played, never stored on the Player",
    pattern: /\btournamentsPlayed\b/,
  },
  {
    why: "profiles.tournaments_played is a column default no screen writes — never read or write it (049)",
    pattern: /\btournaments_played\b/,
  },
  {
    why: "tournamentsNeeded was `10 + i * 2` — a per-year tournament count no source and no player gave (removed with 049)",
    pattern: /\btournamentsNeeded\b/,
  },
];

/** components/ only: a hardcoded denominator ("/12", "of 12 tournaments")
 * or a progress ratio against a profile field. Best effort. */
export const COMPONENT_RULES: Rule[] = [
  {
    why: 'a hardcoded "/N" denominator rendered as text',
    pattern: /(?:>|["'`])\s*\/\s*\d+\s*(?:<|["'`])/,
  },
  {
    why: "a hardcoded tournament target in copy",
    pattern: /\bof\s+\d+\s+tournaments?\b/i,
  },
  {
    why: "a progress ratio against a profile field — the denominator must be something the player set",
    pattern: /Math\.max\(\s*1\s*,\s*player\.\w+\s*\)/,
  },
];

export function violations(src: string, file: string): string[] {
  const code = stripComments(src);
  const rules = file.startsWith("components") ? [...RULES, ...COMPONENT_RULES] : RULES;
  return rules.filter((r) => r.pattern.test(code)).map((r) => `${file}: ${r.why}`);
}

describe("no invented tournament goal (049)", () => {
  it("scans a real number of files", () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES).toContain(join("lib", "auth.ts"));
    expect(FILES).toContain(join("lib", "data", "user.ts"));
  });

  it("emptyPlayer has no planned count and no played count", () => {
    expect(emptyPlayer.tournamentsPlanned).toBeNull();
    expect("tournamentsPlayed" in emptyPlayer).toBe(false);
    expect("tournamentsGoal" in emptyPlayer).toBe(false);
  });

  it("no live file brings back the invented goal, the old names, or a profile read of played", () => {
    const found = FILES.flatMap((f) => violations(readFileSync(f, "utf8"), f));
    expect(found).toEqual([]);
  });

  it("the signup inserts in lib/auth.ts send no tournaments_goal at all", () => {
    const code = stripComments(readFileSync(join("lib", "auth.ts"), "utf8"));
    // The only write is writeCurrentPlayerProfile's, of the player's value.
    const writes = code.match(/tournaments_goal\s*:/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(code).toMatch(/tournaments_goal:\s*player\.tournamentsPlanned/);
  });
});

// Mutation tests: each detector catches the thing that actually shipped.
describe("the detectors catch what shipped before 049", () => {
  const shipped: [string, string, string][] = [
    ["lib/data/user.ts", "emptyPlayer 12", "  tournamentsPlayed: 0,\n  tournamentsGoal: 12,\n"],
    ["lib/data/user.ts", "emptyPlayer planned 12", "  tournamentsPlanned: 12,\n"],
    ["lib/auth.ts", "signup insert", "      commitment_date: x,\n      tournaments_goal: 12,\n"],
    ["lib/auth.ts", "profile read fallback", "    tournamentsPlanned: Number(profile.tournaments_goal ?? 12),\n"],
    ["lib/auth.ts", "played read", "    played: Number(profile.tournaments_played ?? 0),\n"],
    ["lib/auth.ts", "planned || default", "const n = player.tournamentsPlanned || 12;\n"],
    [
      "components/parents/parent-dashboard-view.tsx",
      "the 0/12 line",
      '<span className="text-stone-light">/{player.tournamentsGoal}</span>',
    ],
    ["components/x.tsx", "literal /12", '<span className="text-stone-light">/12</span>'],
    ["components/x.tsx", "of 12 tournaments", "<p>3 of 12 tournaments played</p>"],
    [
      "components/x.tsx",
      "progress bar",
      "const pct = Math.round((played / Math.max(1, player.tournamentsPlanned)) * 100);",
    ],
    ["components/cost/cost-calculator-view.tsx", "calculator default", "    tournamentsPerYear: player.tournamentsGoal || 0,\n"],
    ["lib/db/plan.ts", "roadmap per-year count", "    const tournamentsNeeded = 10 + i * 2;\n"],
  ];
  for (const [file, label, src] of shipped) {
    it(`catches ${label}`, () => {
      expect(violations(src, file).length).toBeGreaterThan(0);
    });
  }

  it("does not flag the honest shapes", () => {
    const ok = [
      "  tournamentsPlanned: null,\n",
      "    tournamentsPlanned: toTournamentsPlannedOrNull(profile.tournaments_goal),\n",
      "    ...(player.tournamentsPlanned !== undefined ? { tournaments_goal: player.tournamentsPlanned } : {}),\n",
      '// profiles.tournaments_played is not read: no screen ever wrote it\n',
      'const url = "https://example.com/12"; const x = 1;\n',
    ];
    for (const src of ok) expect(violations(src, "lib/auth.ts")).toEqual([]);
  });

  it("comment stripping keeps code after a URL string", () => {
    expect(stripComments('const u = "https://a.b/c"; const tournamentsGoal = 1;')).toContain("tournamentsGoal");
  });
});
