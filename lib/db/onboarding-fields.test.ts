import { describe, expect, it } from "vitest";
import { latestFunctionDefinition, readMigrations, withoutComments } from "./migration-sql";
import { writeCurrentPlayerProfile, type PlayerWriteContext } from "@/lib/auth";
import { PlayerBodySchema } from "@/lib/api-schemas/profile";
import { emptyPlayer } from "@/lib/data/user";
import { ENROLLMENT_TERMS, type Player } from "@/lib/types";

/* Diagnostic onboarding fields (B1/B3, migration 041).
 *
 * birth_month is month + year only — never a day — and WRITE-ONCE from the
 * client exactly like birth_year. enrollment_term is client-writable. The
 * rule that matters for the app: writeCurrentPlayerProfile() upserts the
 * whole profile on every save, so it must never send birth_month as NULL
 * (that would be a change once a month is stored, refused 42501, and every
 * save would fail). Mutation-tested; see docs/HANDOFF.md §J Step 16. */

const migrations = readMigrations();
const m041 = migrations.find((m) => m.file.startsWith("041_"));

describe("041 SQL", () => {
  it("exists", () => {
    expect(m041).toBeDefined();
  });

  it("birth_month is 1..12 (a month, never a day) and enrollment_term is the three values", () => {
    const sql = withoutComments(m041!.body).toLowerCase();
    expect(sql).toMatch(/check \(birth_month is null or birth_month between 1 and 12\)/);
    for (const term of ENROLLMENT_TERMS) expect(sql).toContain(`'${term}'`);
    expect(sql).not.toMatch(/birth_day|date_of_birth|birth_date/);
  });

  it("the latest profile trigger keeps birth_month write-once and every earlier rule", () => {
    const def = latestFunctionDefinition("protect_privileged_profile_columns", migrations);
    expect(def).not.toBeNull();
    const sql = def!.sql.toLowerCase();
    expect(sql, def!.file).toMatch(
      /if old\.birth_month is not null and new\.birth_month is distinct from old\.birth_month then\s+raise exception/
    );
    expect(sql, def!.file).toMatch(/family_code_is_taken\(new\.family_code\)/);
    expect(sql, def!.file).toMatch(/consent_required_for_birth_year\(new\.birth_year\)/);
  });

  it("041's own trigger version keeps 035's rules too (it is what ships if 043 is rolled back)", () => {
    const def = latestFunctionDefinition(
      "protect_privileged_profile_columns",
      migrations.filter((m) => m.file <= m041!.file)
    );
    expect(def!.file).toBe(m041!.file);
    const sql = def!.sql.toLowerCase();
    expect(sql).toMatch(/if old\.birth_month is not null and new\.birth_month is distinct from old\.birth_month/);
    expect(sql).toMatch(/family_code_is_taken\(new\.family_code\)/);
    expect(sql).toMatch(/new\.birth_year is null/);
    expect(sql).toMatch(/profile_row_exists\(new\.id\)/);
    expect(sql).toMatch(/new\.role\s+is distinct from old\.role/);
  });
});

function fakeSupabase() {
  const upsertCalls: Record<string, unknown>[] = [];
  const supabase = {
    from: () => ({
      upsert: async (payload: Record<string, unknown>) => {
        upsertCalls.push(payload);
        return { error: null };
      },
    }),
  };
  return { supabase: supabase as unknown as PlayerWriteContext["supabase"], upsertCalls };
}

const ctx = (supabase: PlayerWriteContext["supabase"]): PlayerWriteContext => ({
  supabase,
  userId: "00000000-0000-0000-0000-0000000b0101",
  userEmail: "fake-pb1-player@example.com",
});

describe("writeCurrentPlayerProfile and the 041 columns", () => {
  it("never sends birth_month when it is null (would be a refused change)", async () => {
    const { supabase, upsertCalls } = fakeSupabase();
    await writeCurrentPlayerProfile({ ...emptyPlayer, name: "Fake", birthMonth: null }, ctx(supabase));
    expect(upsertCalls[0]).not.toHaveProperty("birth_month");
  });

  it("sends birth_month when set (first fill-in, or the stored value round-tripped)", async () => {
    const { supabase, upsertCalls } = fakeSupabase();
    await writeCurrentPlayerProfile({ ...emptyPlayer, name: "Fake", birthMonth: 4 }, ctx(supabase));
    expect(upsertCalls[0]).toMatchObject({ birth_month: 4 });
  });

  it("sends enrollment_term when the Player has the field, and not when it predates 041", async () => {
    const { supabase, upsertCalls } = fakeSupabase();
    await writeCurrentPlayerProfile({ ...emptyPlayer, name: "Fake", enrollmentTerm: "spring_after_grad" }, ctx(supabase));
    expect(upsertCalls[0]).toMatchObject({ enrollment_term: "spring_after_grad" });

    const legacy: Player = { ...emptyPlayer, name: "Fake" };
    delete (legacy as Partial<Player>).enrollmentTerm;
    await writeCurrentPlayerProfile(legacy, ctx(supabase));
    expect(upsertCalls[1]).not.toHaveProperty("enrollment_term");
  });

  it("never sends the privileged verification columns, whatever the Player says", async () => {
    const { supabase, upsertCalls } = fakeSupabase();
    await writeCurrentPlayerProfile({ ...emptyPlayer, name: "Fake", emailVerified: true }, ctx(supabase));
    expect(upsertCalls[0]).not.toHaveProperty("email_verified_at");
    expect(upsertCalls[0]).not.toHaveProperty("email_verified_for");
  });
});

describe("PlayerBodySchema accepts the new fields and rejects bad values", () => {
  const base = { ...emptyPlayer, name: "Fake" };

  it("accepts a month and a term", () => {
    expect(PlayerBodySchema.safeParse({ ...base, birthMonth: 12, enrollmentTerm: "not_sure" }).success).toBe(true);
    expect(PlayerBodySchema.safeParse({ ...base, birthMonth: null, enrollmentTerm: null }).success).toBe(true);
  });

  it("rejects a day-of-month and an unknown term", () => {
    expect(PlayerBodySchema.safeParse({ ...base, birthMonth: 13 }).success).toBe(false);
    expect(PlayerBodySchema.safeParse({ ...base, birthMonth: 0 }).success).toBe(false);
    expect(PlayerBodySchema.safeParse({ ...base, enrollmentTerm: "winter" }).success).toBe(false);
  });
});
