import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GPA_MAX,
  GPA_MIN,
  GPA_RANGE_ERROR,
  PROFILE_NAME_REQUIRED,
  PROFILE_VALUE_REJECTED,
  parseGpaText,
  profileNameError,
  profileWriteFailure,
} from "./profile-fields";
import { PlayerBodySchema } from "./api-schemas/profile";
import { emptyPlayer } from "./data/user";

// QA sweep 2026-11-20, H2 + H3 (Settings → Profile).

describe("profile name (H2)", () => {
  it("refuses blank and whitespace-only names", () => {
    expect(profileNameError("")).toBe(PROFILE_NAME_REQUIRED);
    expect(profileNameError("   ")).toBe(PROFILE_NAME_REQUIRED);
    expect(profileNameError("Sam R.")).toBeNull();
  });

  it("the /api/profile body schema refuses a blank name too, and trims", () => {
    const blank = PlayerBodySchema.safeParse({ ...emptyPlayer, name: "  " });
    expect(blank.success).toBe(false);
    if (!blank.success) expect(blank.error.issues[0]?.message).toBe(PROFILE_NAME_REQUIRED);
    const ok = PlayerBodySchema.safeParse({ ...emptyPlayer, name: "  Sam R. " });
    expect(ok.success && ok.data.name).toBe("Sam R.");
  });
});

describe("GPA (H3)", () => {
  it("is pinned to profiles_gpa_check (migration 014)", () => {
    const sql = readFileSync(
      join(__dirname, "..", "supabase/migrations/014_profile_fields_and_deletion.sql"),
      "utf8"
    );
    expect(sql).toMatch(new RegExp(`gpa >= ${GPA_MIN} and gpa <= ${GPA_MAX}`));
  });

  it("parses blank as Not set and accepts 0–5 (weighted GPAs exist)", () => {
    expect(parseGpaText("")).toEqual({ value: null, error: null });
    expect(parseGpaText(" 3.7 ")).toEqual({ value: 3.7, error: null });
    expect(parseGpaText("0")).toEqual({ value: 0, error: null });
    expect(parseGpaText("4.6")).toEqual({ value: 4.6, error: null });
    expect(parseGpaText("5")).toEqual({ value: 5, error: null });
    expect(parseGpaText(".5")).toEqual({ value: 0.5, error: null });
  });

  it("refuses out-of-range and non-numeric text with a sentence", () => {
    for (const t of ["5.7", "6", "-1", "abc", "3.7.1", "1e1", "Infinity", "NaN", "3,7"]) {
      expect(parseGpaText(t), t).toEqual({ value: null, error: GPA_RANGE_ERROR });
    }
  });

  it("the body schema refuses a GPA outside 0–5 with the same sentence", () => {
    const base = { ...emptyPlayer, name: "Test Player" };
    for (const gpa of [5.7, -0.1]) {
      const r = PlayerBodySchema.safeParse({ ...base, gpa });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toBe(GPA_RANGE_ERROR);
    }
    for (const gpa of [0, 3.7, 5, null]) {
      expect(PlayerBodySchema.safeParse({ ...base, gpa }).success, String(gpa)).toBe(true);
    }
  });
});

describe("profileWriteFailure: a CHECK violation is a 400 with a sentence", () => {
  const pg = (code: string, message = 'new row for relation "profiles" violates check constraint') =>
    Object.assign(new Error(message), { code });

  it("23514 / 23502 / class 22 → 400, never raw Postgres text", () => {
    for (const code of ["23514", "23502", "22P02", "22003", "22001"]) {
      const r = profileWriteFailure(pg(code));
      expect(r, code).toEqual({ status: 400, error: PROFILE_VALUE_REJECTED });
      expect(r.error).not.toMatch(/violates|constraint|relation/i);
    }
  });

  it("keeps the trigger's own sentence for other failures (e.g. 42501)", () => {
    const r = profileWriteFailure(pg("42501", "This profile field can only be changed by Seeded."));
    expect(r).toEqual({ status: 500, error: "This profile field can only be changed by Seeded." });
  });

  it("route.ts maps every write failure through it", () => {
    const route = readFileSync(join(__dirname, "..", "app/api/profile/route.ts"), "utf8");
    expect(route).toMatch(/profileWriteFailure\(err\)/);
    expect(route).not.toMatch(/err\.message/);
  });
});
