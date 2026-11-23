import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { codeOnly, decodeSourceText, readableSource } from "./testing/source-text";

// Workstream 2: no guessed number may sit next to a real school's name.
//
// The cost calculator printed "Rough scholarship value" and "Net: $…" under
// real schools from `annualCost` (three numbers chosen by rank and division)
// and `scholarshipPercent` (three more, by division). The school page said
// "Cost, aid, and enrollment data coming soon". Seeded holds none of it.
// docs/DATA_QUALITY.md is the inventory of what the catalogue really holds:
// name, place, division, conference, an UNVERIFIED roster-UTR estimate
// (always labelled UTR_RANGE_SOURCE_LABEL) and a U.S. News rank with no
// edition year (always labelled as such).
//
// When a sourced field arrives (P1-DATA-1), delete its entry here in the
// same commit — do not reword around it.
//
// 2026-11-22: acceptance rate arrived, sourced. The owner's sheet's
// "Program Info" tab carries College Scorecard's admission rate with its
// URL and read date (migration 053, program_details; a value without its
// source is refused by a CHECK and dropped by the importer and the loader).
// So `acceptanceRate` and "acceptance rate" are allowed — ONLY in the files
// that carry the sourced value (SOURCED_ACCEPTANCE_RATE_FILES); anywhere else
// they still fail (narrowed after the independent review, 2026-11-22). Cost
// of attendance is sourced the same way but is carried as
// `costOfAttendanceUsd`, which the cost entries below never matched; they
// stay, so an invented price elsewhere still fails.
const SOURCED_ACCEPTANCE_RATE_FILES = new Set([
  "lib/types.ts",
  "lib/catalog/program-info.ts",
  "lib/db/programs.ts",
  "components/seeded/schools/seeded-school-detail.tsx",
  "components/seeded/methodology/seeded-methodology-view.tsx",
]);

const ROOT = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "testing") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.") && !name.endsWith("database.types.ts")) out.push(p);
  }
  return out;
}
const FILES = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));

/** Per-school quantities Seeded has no source for. As code identifiers they
 * mean someone is computing or carrying one. */
const GUESSED_FIELDS =
  /\b(annualCost|scholarshipPercent|scholarshipValue|netCost|costOfAttendance|tuitionCost|rosterSize|rosterSpots|openSpots|spotsOpen|openingsCount|seniorsGraduating|seniorsLeaving|responseRate|replyRate|coachResponseRate|acceptanceRate|admitRate|avgScholarship|tuition\w*|rosterCount|aidPercent\w*|athleticAid\w*|scholarshipAmount)\b/;

/** The same quantities as words on a screen. Patterns are written against
 * readable text: entities, \u escapes and JSX joins are decoded first, and
 * a template slot reads as a digit. */
const GUESSED_COPY: { pattern: RegExp; why: string }[] = [
  { pattern: /scholarship value|\bnet cost\b|\bnet:\s*\$/i, why: "a per-school aid or net-cost figure" },
  { pattern: /\b\d{1,3}\s?% (?:athletic )?(?:scholarship|aid)\b/i, why: "a scholarship percentage" },
  { pattern: /cost of attendance[^.]{0,20}\$\s?\d|\$\s?\d[\d,]*\s*(?:per year |a year |\/yr )?(?:tuition|to attend)/i, why: "a cost-of-attendance figure" },
  { pattern: /\b\d+\s+(?:open\s+)?(?:roster\s+)?spots?\s+(?:open|available|left)\b|\bopen spots?\b/i, why: "open spots (CLAUDE.md: 'leaving' counts only, never open spots)" },
  { pattern: /\b\d+\s+seniors?\s+(?:graduating|leaving)\b|\bseniors? (?:graduating|leaving):\s*\d/i, why: "a seniors-leaving count we do not have" },
  { pattern: /\b(?:acceptance|admit|response|reply) rate\b/i, why: "a rate Seeded has no data for" },
  { pattern: /coach(?:es)? (?:usually |typically )?(?:reply|respond|answer)s? within\b/i, why: "a response-time claim" },
  { pattern: /(?:cost|aid|enrollment)[^.]{0,40}coming soon/i, why: "a promise of data nobody is collecting" },
  { pattern: /\btuition\b[^.]{0,30}\$\s?\d|\$\s?\d[\d,.]*\s?k?\s*(?:\/\s?yr\b|a year\b|per year\b)/i, why: "a tuition or per-year price for a program" },
  { pattern: /\b(?:average|avg\.?|typical)\s+(?:athletic\s+)?(?:aid|scholarship)\b/i, why: "an average aid figure" },
  { pattern: /% of a full scholarship|\b\d+\s+players?\s+(?:graduating|leaving)\s+in\b/i, why: "a scholarship share or a per-year departures count" },
];

describe("no guessed per-school number reaches a user", () => {
  it("no code carries a per-school field Seeded has no source for", () => {
    const hits = FILES.filter(
      (f) => GUESSED_FIELDS.test(codeOnly(f)) && !(SOURCED_ACCEPTANCE_RATE_FILES.has(relative(ROOT, f)) && codeOnly(f).match(GUESSED_FIELDS)?.[0] === "acceptanceRate")
    ).map((f) => {
      const m = codeOnly(f).match(GUESSED_FIELDS);
      return `${relative(ROOT, f)}: ${m?.[0]}`;
    });
    expect(hits).toEqual([]);
  });

  for (const { pattern, why } of GUESSED_COPY) {
    it(`no copy shows ${why}`, () => {
      const hits = FILES.filter((f) => {
        const text = readableSource(f);
        if (!pattern.test(text)) return false;
        // The sourced acceptance rate, only where it is carried.
        if (why === "a rate Seeded has no data for" && SOURCED_ACCEPTANCE_RATE_FILES.has(relative(ROOT, f))) {
          return /\b(?:admit|response|reply) rate\b/i.test(text);
        }
        return true;
      }).map((f) => relative(ROOT, f));
      expect(hits).toEqual([]);
    });
  }
});

describe("the guard reads what the screen shows, not how the source spells it", () => {
  // Each of these spellings defeated an earlier guard in this repo.
  const spellings: [string, string][] = [
    ["JSX entity", "<p>Rough scholarship value: {money(v)}</p>"],
    ["template literal", "`${n} spots open next fall`"],
    ["\\u2019 escape", '"Each coach\\u2019s response rate"'],
    ["numeric entity", "<p>Coaches usually reply within 48 hours</p>"],
    ["JSX join", '<p>Net:{" "}${"$"}{amount}</p>'],
    ["percent", "`${pct}% athletic scholarship`"],
    // Each of these got past the guard on 2026-11-16 (independent verifier).
    ["template price", "{`$${x}k/yr`}"],
    ["entity before tuition", "<p>tuition: &#36;58,000 a year</p>"],
    ["average aid", "<p>Average athletic aid: {money(a)}</p>"],
    ["graduating count", "`${n} players graduating in 2027`"],
    ["split scholarship share", "<p>{pct}% of a full\n            scholarship</p>"],
  ];
  for (const [label, sample] of spellings) {
    it(`catches a ${label}`, () => {
      const text = decodeSourceText(sample).replace(/\$\{[^}]*\}/g, "7");
      expect(GUESSED_COPY.some(({ pattern }) => pattern.test(text)), text).toBe(true);
    });
  }

  it("does not fire on the honest sentence that replaced them", () => {
    const honest =
      "Not available yet. Seeded holds no cost-of-attendance or athletic-aid figures for any program, so it does not estimate them.";
    expect(GUESSED_COPY.some(({ pattern }) => pattern.test(honest))).toBe(false);
  });
});
