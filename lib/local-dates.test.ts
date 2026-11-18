import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatDate, formatShortDate, localDateKey, parseLocalDate, toLocalDateString } from "./time";

// C9 (2026-11-18). A UTR logged for Nov 18 in America/New_York rendered
// "self-reported Nov 17" on /plan: `new Date("2026-11-18")` is UTC midnight,
// which is 7pm the day before anywhere west of Greenwich. The reverse bug —
// `d.toISOString().slice(0, 10)` — writes tomorrow's date on any evening.
//
// Date-only values (Postgres `date` columns) are LOCAL calendar days. The
// assertions below hold in ANY zone, and `npm run test:tz` runs the whole
// suite twice — under America/New_York (UTC−5 in November) and
// Pacific/Auckland (UTC+13), wrong in opposite directions. (Vitest runs
// files in worker threads, where assigning process.env.TZ mid-run does not
// re-read the zone, so the zone has to be set before the run starts.)

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe(`date-only values (running in ${ZONE})`, () => {
  it("runs in the zone the script asked for", () => {
    if (process.env.TZ) expect(ZONE).toBe(process.env.TZ);
  });

  it("parseLocalDate keeps the calendar day; new Date() on the same string does not", () => {
    const d = parseLocalDate("2026-11-18");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 18]);
    // The bug this exists for: west of Greenwich the naive parse is the 17th.
    const naive = new Date("2026-11-18");
    if (naive.getTimezoneOffset() > 0) expect(naive.getDate()).toBe(17);
  });

  it("the label a player sees for a UTR logged on Nov 18 says Nov 18", () => {
    expect(formatShortDate("2026-11-18")).toBe("Nov 18");
    expect(formatDate("2026-11-18")).toBe("Nov 18, 2026");
  });

  it("toLocalDateString writes the LOCAL day, just after midnight and late evening", () => {
    const morning = new Date(2026, 10, 18, 0, 5);
    const evening = new Date(2026, 10, 18, 23, 55);
    expect(toLocalDateString(morning)).toBe("2026-11-18");
    expect(toLocalDateString(evening)).toBe("2026-11-18");
    // ...where the UTC slice gives another day for one of them in any zone
    // that is not UTC itself.
    if (morning.getTimezoneOffset() !== 0) {
      const utc = [morning, evening].map((d) => d.toISOString().slice(0, 10));
      expect(utc).not.toEqual(["2026-11-18", "2026-11-18"]);
    }
  });

  it("round-trips: write a day, read it back, same day — across DST changes too", () => {
    for (const key of ["2026-01-01", "2026-03-08", "2026-04-05", "2026-09-27", "2026-11-01", "2026-12-31"]) {
      expect(toLocalDateString(parseLocalDate(key))).toBe(key);
    }
  });

  it("localDateKey is the same function, not a second rule", () => {
    expect(localDateKey).toBe(toLocalDateString);
  });

  it("a full timestamp is still parsed as the instant it is", () => {
    expect(parseLocalDate("2026-11-18T15:00:00Z").getTime()).toBe(Date.UTC(2026, 10, 18, 15));
  });
});

/* ------------------------------------------------------------ the guard */

const ROOTS = ["app", "components", "lib"];

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
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

// Every Postgres `date` column, by its camelCase field and its raw name.
const DATE_ONLY_FIELDS =
  "recordedAt|matchDate|eventDate|checkinDate|expenseDate|commitmentDate|recorded_at|match_date|event_date|checkin_date|expense_date|commitment_date";

const BANNED: { name: string; re: RegExp }[] = [
  { name: "toISOString().slice(0, 10) — the UTC day", re: /toISOString\(\)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*10\s*\)/ },
  { name: 'toISOString().split("T")[0] — the UTC day', re: /toISOString\(\)\s*\.\s*split\(\s*["'`]T["'`]\s*\)/ },
  { name: 'new Date("YYYY-MM-DD") — UTC midnight', re: /new Date\(\s*["'`]\d{4}-\d{2}-\d{2}["'`]\s*\)/ },
  {
    name: "new Date(<date column>) — UTC midnight; use parseLocalDate",
    re: new RegExp(`new Date\\(\\s*[\\w.?!\\]\\[]*\\.(${DATE_ONLY_FIELDS})\\s*\\)`),
  },
];

describe("guard: date-only values are never parsed or written as UTC", () => {
  const files = ROOTS.flatMap((r) => sourceFiles(r));

  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no app code uses a banned date pattern", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const lines = stripComments(readFileSync(f, "utf8")).split("\n");
      lines.forEach((line, i) => {
        for (const b of BANNED) if (b.re.test(line)) offenders.push(`${f}:${i + 1} ${b.name}`);
      });
    }
    expect(offenders, "Use toLocalDateString() to write and parseLocalDate() to read (lib/time.ts).").toEqual([]);
  });

  it("the guard catches each pattern (mutation check)", () => {
    const probes = [
      "const k = new Date().toISOString().slice(0, 10);",
      'const k = d.toISOString().split("T")[0];',
      'const d = new Date("2026-11-18");',
      "const d = new Date(lastLoggedUtr.recordedAt);",
      "const d = new Date(m.matchDate);",
    ];
    for (const p of probes) expect(BANNED.some((b) => b.re.test(p)), p).toBe(true);
    // ...and leaves the right ones alone.
    for (const ok of ["parseLocalDate(e.recordedAt)", "new Date(row.created_at)", "new Date(entry.updatedAt)"]) {
      expect(BANNED.some((b) => b.re.test(ok)), ok).toBe(false);
    }
  });
});
