import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  missingClassYearPhrase,
  missingPlayerUtrPhrase,
  resolveFamilyPlayerFacts,
  rosterStatsLocked,
} from "./family-view";
import { explainSchoolFit } from "./school-fit";
import type { Player, SchoolLite } from "./types";

/* Migration 044 returns the roster's player stats (current_utr, grade,
 * graduation_year, target_school_slugs, gender) as NULL to a family that is
 * not on the Family plan. A NULL there therefore means "locked" as often as
 * "never entered", and the screens that read the roster outside the
 * paywalled /family pages must say which — "Maya hasn't logged a UTR yet"
 * to a free parent whose child has a 9.1 is untrue. These pin that. */

const parentViewer = {
  currentUTR: 0,
  graduationYear: 2000,
  gender: "female",
  role: "parent",
} as Pick<Player, "currentUTR" | "graduationYear" | "gender" | "role">;

describe("044 nulls render honestly", () => {
  it("a free family's player row resolves to nulls — never 0, never the parent's own values", () => {
    const f = resolveFamilyPlayerFacts({ currentUtr: null, graduationYear: null, gender: undefined }, parentViewer);
    expect(f).toEqual({ currentUtr: null, graduationYear: null, gender: null, hasLinkedPlayer: true });
  });

  it("rosterStatsLocked: locked only for a free family; unknown while loading", () => {
    expect(rosterStatsLocked(undefined)).toBeUndefined();
    expect(rosterStatsLocked({ unlocked: false, reason: "free" })).toBe(true);
    expect(rosterStatsLocked({ unlocked: true, reason: "family" })).toBe(false);
    expect(rosterStatsLocked({ unlocked: false, reason: "no-family" })).toBe(false);
  });

  it("says 'shows with the Family plan' when locked, 'hasn't logged' only when it is true", () => {
    expect(missingPlayerUtrPhrase("Maya", true)).toBe("Maya’s rating shows with the Family plan");
    expect(missingPlayerUtrPhrase("Maya", false)).toBe("Maya hasn’t logged a UTR yet");
    expect(missingClassYearPhrase(true)).toBe("Class year shows with the Family plan");
    expect(missingClassYearPhrase(false)).toBe("Class year not set");
  });

  it("explainSchoolFit says the rating is hidden, not missing, when ratingHidden", () => {
    const school = {
      id: "stanford",
      name: "Stanford",
      shortName: "Stanford",
      city: "Testville",
      state: "VA",
      conference: "Test Conf",
      division: "D1",
      gender: "men",
      primaryColor: "#000",
      secondaryColor: "#000",
      textColor: "#fff",
      avgRosterUTR: 13.6,
      minCompetitiveUTR: 12.3,
      usNewsRanking: 50,
      slug: "stanford",
    } as SchoolLite;
    const base = { graduationYear: 2028, subjectName: "Maya" };
    expect(explainSchoolFit(null, school, base).summary).toMatch(/Maya hasn't logged a UTR yet/);
    const hidden = explainSchoolFit(null, school, { ...base, ratingHidden: true }).summary;
    expect(hidden).toMatch(/Maya's rating shows with the Family plan/);
    expect(hidden).not.toMatch(/hasn't logged/);
  });

  it("every screen that reads roster stats outside /family asks the plan before saying 'missing'", () => {
    const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");
    const files = [
      "components/seeded/schools/seeded-schools-browser.tsx",
      "components/seeded/schools/seeded-school-detail.tsx",
      "components/seeded/settings/parent-settings-view.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} must ask the Family plan status`).toMatch(/rosterStatsLocked\(/);
      expect(src, `${f} must not hardcode the 'missing' sentence`).not.toMatch(/hasn't logged a UTR yet|"Class year not set"/);
    }
  });
});
