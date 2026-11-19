import { describe, expect, it } from "vitest";
import { formatPlayerUtr, isValidEmailAddress } from "./utils";

// Guards the outreach "To" field. Seeded stores no coach contacts (P0-3), so
// the player types the address — this is the only check between a typo and a
// Gmail compose window that goes nowhere. Fixtures use the reserved
// .test/.example TLDs so nothing here resembles a real coach's address.
describe("isValidEmailAddress", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmailAddress("coach@test.example")).toBe(true);
    expect(isValidEmailAddress("first.last+tag@mail.test.example")).toBe(true);
    expect(isValidEmailAddress("  coach@test.example  ")).toBe(true);
  });

  it("rejects an empty or whitespace-only field", () => {
    expect(isValidEmailAddress("")).toBe(false);
    expect(isValidEmailAddress("   ")).toBe(false);
  });

  it("rejects the shapes a hurried 15-year-old actually types", () => {
    expect(isValidEmailAddress("coach")).toBe(false);
    expect(isValidEmailAddress("coach@")).toBe(false);
    expect(isValidEmailAddress("@test.example")).toBe(false);
    expect(isValidEmailAddress("coach@test")).toBe(false);
    expect(isValidEmailAddress("coach test@test.example")).toBe(false);
    expect(isValidEmailAddress("coach@test..example")).toBe(false);
  });

  it("rejects multiple addresses — one draft, one recipient", () => {
    expect(isValidEmailAddress("a@test.example, b@test.example")).toBe(false);
    expect(isValidEmailAddress("a@test.example; b@test.example")).toBe(false);
  });

  it("rejects an absurdly long value", () => {
    expect(isValidEmailAddress(`${"a".repeat(250)}@test.example`)).toBe(false);
  });
});

describe("formatPlayerUtr", () => {
  it("prints a logged rating the way UTR publishes it, two decimals", () => {
    expect(formatPlayerUtr(5.95)).toBe("5.95");
    // the bug it exists for: toFixed(1) and formatUTR both turned these into
    // a different rating
    expect(formatPlayerUtr(6)).toBe("6.00");
    expect(formatPlayerUtr(9.1)).toBe("9.10");
    expect(formatPlayerUtr(12.5)).toBe("12.50");
  });
});
