import { describe, expect, it } from "vitest";
import { UtrEntryBodySchema } from "./utr-entries";

describe("UtrEntryBodySchema", () => {
  it("accepts a valid body", () => {
    const result = UtrEntryBodySchema.safeParse({
      utr: 9.5,
      recordedAt: "2026-01-15",
      note: "Starting UTR",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a body with no note", () => {
    const result = UtrEntryBodySchema.safeParse({ utr: 9.5, recordedAt: "2026-01-15" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-numeric utr", () => {
    const result = UtrEntryBodySchema.safeParse({ utr: "9.5", recordedAt: "2026-01-15" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing recordedAt", () => {
    const result = UtrEntryBodySchema.safeParse({ utr: 9.5 });
    expect(result.success).toBe(false);
  });

  it("rejects an empty recordedAt", () => {
    const result = UtrEntryBodySchema.safeParse({ utr: 9.5, recordedAt: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string note", () => {
    const result = UtrEntryBodySchema.safeParse({ utr: 9.5, recordedAt: "2026-01-15", note: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects an entirely malformed body", () => {
    expect(UtrEntryBodySchema.safeParse(null).success).toBe(false);
    expect(UtrEntryBodySchema.safeParse("nope").success).toBe(false);
    expect(UtrEntryBodySchema.safeParse({}).success).toBe(false);
  });
});
