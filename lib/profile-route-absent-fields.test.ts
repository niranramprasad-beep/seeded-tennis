import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PlayerBodySchema, playerWriteFromBody } from "@/lib/api-schemas/profile";
import { writeCurrentPlayerProfile, type PlayerWriteContext } from "@/lib/auth";
import { emptyPlayer } from "@/lib/data/user";

/* Migration 041 added profiles.birth_month (write-once) and
 * profiles.enrollment_term (client-writable). writeCurrentPlayerProfile
 * sends each ONLY when the Player carries it, so a body from an older client
 * — which never had the fields — leaves the stored values alone.
 *
 * app/api/profile/route.ts used to coerce `enrollmentTerm ?? null` before
 * calling it, which turned "absent" into "clear it": any save from an older
 * tab wiped the term a newer one had stored. These pin absent -> untouched,
 * through the route's own mapping, against the real writer. */

function captureUpsert() {
  const rows: Record<string, unknown>[] = [];
  const ctx = {
    supabase: {
      from: () => ({
        upsert: async (row: Record<string, unknown>) => {
          rows.push(row);
          return { error: null };
        },
      }),
    },
    userId: "00000000-0000-0000-0000-0000000b0501",
    userEmail: "fake-pb5-noutr@example.com",
  } as unknown as PlayerWriteContext;
  return { rows, ctx };
}

function bodyWithout(...keys: string[]) {
  const body: Record<string, unknown> = { ...emptyPlayer, name: "Fake Pb5 Noutr" };
  for (const k of keys) delete body[k];
  const parsed = PlayerBodySchema.safeParse(body);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : (null as never);
}

describe("an older client's body never wipes enrollment_term or birth_month", () => {
  it("the route's mapping keeps absent fields absent", () => {
    const mapped = playerWriteFromBody(bodyWithout("enrollmentTerm", "birthMonth"));
    expect("enrollmentTerm" in mapped && mapped.enrollmentTerm !== undefined).toBe(false);
    expect(mapped.birthMonth).toBeUndefined();
  });

  it("absent -> the upsert does not mention either column", async () => {
    const { rows, ctx } = captureUpsert();
    await writeCurrentPlayerProfile(playerWriteFromBody(bodyWithout("enrollmentTerm", "birthMonth")), ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("enrollment_term");
    expect(rows[0]).not.toHaveProperty("birth_month");
  });

  it("present -> written; an explicit null term clears it (the newer client asked to)", async () => {
    const a = captureUpsert();
    await writeCurrentPlayerProfile(
      playerWriteFromBody({ ...bodyWithout(), enrollmentTerm: "fall_after_grad", birthMonth: 4 }),
      a.ctx
    );
    expect(a.rows[0]).toMatchObject({ enrollment_term: "fall_after_grad", birth_month: 4 });

    const b = captureUpsert();
    await writeCurrentPlayerProfile(playerWriteFromBody({ ...bodyWithout(), enrollmentTerm: null }), b.ctx);
    expect(b.rows[0]).toHaveProperty("enrollment_term", null);
  });

  it("the route does not coerce either field to null (static guard)", () => {
    const src = readFileSync(join(__dirname, "..", "app", "api", "profile", "route.ts"), "utf8");
    expect(src).not.toMatch(/enrollmentTerm\s*:\s*[^,\n]*\?\?\s*null/);
    expect(src).not.toMatch(/birthMonth\s*:\s*[^,\n]*\?\?\s*null/);
    expect(src).toMatch(/writeCurrentPlayerProfile\(\s*playerWriteFromBody\(parsed\.data\)/);
  });
});
