import { describe, expect, it } from "vitest";
import { schoolInitials } from "@/components/seeded/ui/school-monogram";

describe("schoolInitials: initials from the school's own name, never a logo", () => {
  it("uses the first letters of the first two meaningful words", () => {
    expect(schoolInitials("North Carolina")).toBe("NC");
    expect(schoolInitials("University of Virginia")).toBe("VI");
    expect(schoolInitials("Texas A&M")).toBe("TA");
  });
  it("keeps short all-caps names whole", () => {
    expect(schoolInitials("UCLA")).toBe("UCLA");
    expect(schoolInitials("USC")).toBe("USC");
  });
  it("keeps a leading acronym and adds the next word's initial", () => {
    expect(schoolInitials("NC State")).toBe("NCS");
    expect(schoolInitials("TCU")).toBe("TCU");
  });
  it("never returns more than four characters", () => {
    expect(schoolInitials("UCLA Bruins")).toBe("UCLA");
  });
  it("takes two letters of a single ordinary word", () => {
    expect(schoolInitials("Stanford")).toBe("ST");
    expect(schoolInitials("Duke")).toBe("DU");
  });
});
