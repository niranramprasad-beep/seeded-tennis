import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVACY_SECTIONS, POLICY_CONTACT_EMAIL, POLICY_EFFECTIVE_DATE } from "./policy";

// TASK 4. A privacy policy that drifts from the product is the most
// expensive kind of stale copy there is: it is a written promise about
// children's data that nobody re-reads after the code changes underneath it.
//
// So every claim in lib/legal/policy.ts carries a `source`, and these tests
// check that the sources still exist and still say what the policy says they
// say. They cannot prove the prose is correct — that is the lawyer's job —
// but they fail loudly when the thing being described stops being true.

const repo = (...p: string[]) => join(__dirname, "..", "..", ...p);
const read = (...p: string[]) => readFileSync(repo(...p), "utf8");

describe("every section is sourced", () => {
  it("names where it is true in the code", () => {
    for (const section of PRIVACY_SECTIONS) {
      expect(section.source.length, section.id).toBeGreaterThan(10);
      expect(section.body.length, section.id).toBeGreaterThan(0);
    }
  });

  it("references files that actually exist", () => {
    // Pull every "path/like/this.ext" out of the source fields and check it.
    const paths = new Set<string>();
    for (const section of PRIVACY_SECTIONS) {
      // tsx BEFORE ts: the alternation is first-match, so "ts" would
      // truncate "google-analytics.tsx" to a file that does not exist.
      for (const m of section.source.matchAll(/[\w./-]+\.(?:tsx|ts|sql)/g)) {
        const p = m[0];
        if (p.includes("*")) continue;
        paths.add(p.startsWith("migration ") ? p.replace("migration ", "") : p);
      }
    }
    expect(paths.size).toBeGreaterThan(5);
    for (const p of paths) {
      const candidates = [repo(p), repo("supabase", "migrations", p)];
      expect(candidates.some((c) => existsSync(c)), `policy cites a missing file: ${p}`).toBe(true);
    }
  });
});

describe("the claims still match the code", () => {
  it("deletion really is immediate, as the policy says", () => {
    const migration = read("supabase", "migrations", "029_real_account_deletion.sql");
    expect(migration).toContain("delete from auth.users where id = v_user");
    // And nothing re-introduced a grace period.
    const route = read("app", "api", "account", "deletion", "route.ts");
    expect(route).toContain('action: z.literal("delete")');
    // Only the schema, not the file: the comments above it explain that the
    // old request/cancel pair was removed, and matching prose would make
    // this test fail for saying the right thing.
    const schema = route.slice(route.indexOf("const BodySchema"), route.indexOf("export async function"));
    expect(schema).not.toContain("cancel");
    expect(schema).not.toContain("request");
  });

  it("the export really covers every table, as the policy says", () => {
    // The export's own completeness guard is lib/db/account-export.test.ts;
    // here we only check the route the policy points people at exists.
    expect(existsSync(repo("app", "api", "account", "export", "route.ts"))).toBe(true);
  });

  it("under-13 accounts really are inert, as the policy says", () => {
    const migration = read("supabase", "migrations", "030_under13_parent_consent.sql");
    expect(migration).toContain("as restrictive for all to authenticated");
    expect(migration).toContain("account_active()");
  });

  it("there really is no public profile read, as the policy says", () => {
    const migration = read("supabase", "migrations", "027_narrow_profile_reads_and_rpc_grants.sql");
    expect(migration).toContain('drop policy if exists "profiles_discovery_read"');
  });

  it("Seeded really does not send coach email, as the policy says", () => {
    const schools = read("lib", "db", "schools.ts");
    // A Gmail compose link, never an API send.
    expect(schools).not.toMatch(/gmail\.googleapis|messages\.send/i);
  });

  it("names every processor the code actually uses", () => {
    const processors = PRIVACY_SECTIONS.find((s) => s.id === "processors")!;
    const text = processors.body.join(" ");
    for (const name of ["Supabase", "Vercel", "Whop", "Google Analytics", "Google"]) {
      expect(text, `processor missing from the policy: ${name}`).toContain(name);
    }
  });

  it("does not claim a processor we removed", () => {
    const text = PRIVACY_SECTIONS.flatMap((s) => s.body).join(" ");
    // Gemini and Stripe were deleted in P1-SEC-1 / P1-SEC-5.
    expect(text).not.toMatch(/gemini|stripe|openai/i);
  });
});

describe("the policy says nothing the product cannot do", () => {
  const all = PRIVACY_SECTIONS.flatMap((s) => s.body).join(" ");

  it("makes no promise to email anyone", () => {
    // Seeded has no email or push provider at all (P0-7).
    expect(all).not.toMatch(/we(?:'ll| will) email|send you an email|notify you by email/i);
  });

  it("claims no verification of adults", () => {
    expect(all).not.toMatch(/\bverified parent\b|\bparent verification\b|we verify (?:that )?you/i);
    // And says the opposite, explicitly.
    expect(all).toMatch(/cannot verify/i);
  });

  it("promises no retention window it does not enforce", () => {
    expect(all).not.toMatch(/within \d+ days/i);
  });
});

describe("the basics are present", () => {
  it("has an effective date in ISO form", () => {
    expect(POLICY_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has a contact address", () => {
    expect(POLICY_CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it("covers every topic the brief requires", () => {
    const ids = PRIVACY_SECTIONS.map((s) => s.id);
    for (const required of [
      "what-we-collect",
      "minors",
      "parents",
      "processors",
      "keeping",
      "export-delete",
      "cookies",
      "contact",
    ]) {
      expect(ids, `missing required section: ${required}`).toContain(required);
    }
  });
});
