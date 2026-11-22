import { describe, expect, it } from "vitest";
import { buildCoachEmail, coachEmailCountry } from "./schools";
import { emptyPlayer } from "@/lib/data/user";
import type { School } from "@/lib/types";

// final-check A11: a profile holding the code "US" made the draft read
// "(class of 2027) from US." — a coach should read no country for a US
// player, and never a bare code or the sign-up form's "Other".
describe("coachEmailCountry", () => {
  it("says nothing for the United States in any spelling", () => {
    for (const c of ["United States", "US", "us", "USA", "U.S.", "United States of America", " US "]) {
      expect(coachEmailCountry(c)).toBeNull();
    }
  });
  it("says nothing for a blank, 'Other' or a code it cannot spell out", () => {
    for (const c of ["", "  ", null, undefined, "Other", "other", "FR", "DEU"]) {
      expect(coachEmailCountry(c)).toBeNull();
    }
  });
  it("spells out the codes it knows and keeps full names", () => {
    expect(coachEmailCountry("CA")).toBe("Canada");
    expect(coachEmailCountry("UK")).toBe("the United Kingdom");
    expect(coachEmailCountry("United Kingdom")).toBe("the United Kingdom");
    expect(coachEmailCountry("Canada")).toBe("Canada");
    expect(coachEmailCountry("New Zealand")).toBe("New Zealand");
  });
});

const school: School = {
  id: "1",
  slug: "fake-state-m",
  name: "Fake State University",
  shortName: "Fake State",
  city: "Springfield",
  state: "ZZ",
  conference: "Fake Athletic Conference",
  division: "D1",
  gender: "men",
  primaryColor: "#000",
  secondaryColor: "#fff",
  textColor: "#fff",
  avgRosterUTR: 11.37,
  minCompetitiveUTR: 10.21,
  // Required by the type; the email never reads it.
  usNewsRanking: 0,
};

describe("buildCoachEmail intro country", () => {
  const player = { ...emptyPlayer, name: "Fake Player", graduationYear: 2027, gender: "male" as const };
  it("never prints 'from US'", () => {
    const email = buildCoachEmail({ ...player, country: "US" }, school, []);
    expect(email.body).not.toMatch(/from US\b/);
    expect(email.body).toMatch(/\(class of 2027\)\./);
  });
  it("names a non-US country, spelled out", () => {
    const email = buildCoachEmail({ ...player, country: "CA" }, school, []);
    expect(email.body).toMatch(/\(class of 2027\) from Canada\./);
  });
});
