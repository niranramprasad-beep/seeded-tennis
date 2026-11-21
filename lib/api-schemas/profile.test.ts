import { describe, expect, it } from "vitest";
import { PlayerBodySchema } from "./profile";
import { emptyPlayer } from "@/lib/data/user";

// Every real profile has a name (signup, Google signup and onboarding all
// require one), so the baseline here is emptyPlayer WITH a name. A blank name
// is refused since the 2026-11-20 QA sweep (H2): it used to save, and the next
// load showed the login email in its place.
const named = { ...emptyPlayer, name: "Test Player" };

describe("PlayerBodySchema", () => {
  it("accepts the emptyPlayer baseline once it carries a name", () => {
    expect(PlayerBodySchema.safeParse(named).success).toBe(true);
  });

  it("refuses the nameless emptyPlayer (a blank name is not a name)", () => {
    expect(PlayerBodySchema.safeParse(emptyPlayer).success).toBe(false);
  });

  it("accepts a fully populated valid player", () => {
    const result = PlayerBodySchema.safeParse({
      ...named,
      name: "Maya Chen",
      currentUTR: 9.5,
      graduationYear: 2028,
      gender: "female",
      familyCode: "CHEN-8X2K",
      targetSchoolSlugs: ["duke-w", "stanford-w"],
      weaknesses: ["serve", "mental"],
      homeArea: "Bethesda, MD",
      utrProfileLink: "app.utrsports.net/profiles/12345",
      gpa: 3.7,
      deletionRequestedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted optional fields (familyCode/homeArea/utrProfileLink/gpa/deletionRequestedAt)", () => {
    const { familyCode, homeArea, utrProfileLink, gpa, deletionRequestedAt, ...rest } = named;
    expect(PlayerBodySchema.safeParse(rest).success).toBe(true);
  });

  it("rejects an invalid gender", () => {
    const result = PlayerBodySchema.safeParse({ ...named, gender: "nonbinary" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid role", () => {
    const result = PlayerBodySchema.safeParse({ ...named, role: "coach" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid weakness", () => {
    const result = PlayerBodySchema.safeParse({ ...named, weaknesses: ["volley"] });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { name, ...rest } = named;
    expect(PlayerBodySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects the wrong type for a required field", () => {
    const result = PlayerBodySchema.safeParse({ ...named, currentUTR: "9.5" });
    expect(result.success).toBe(false);
  });

  it("accepts a null gpa and a null deletionRequestedAt", () => {
    const result = PlayerBodySchema.safeParse({
      ...named,
      gpa: null,
      deletionRequestedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a completely malformed body", () => {
    expect(PlayerBodySchema.safeParse(null).success).toBe(false);
    expect(PlayerBodySchema.safeParse({}).success).toBe(false);
  });
});
