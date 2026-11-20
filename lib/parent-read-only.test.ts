import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// "Parent view · read-only" must be true, not a label.
//
// What a parent may WRITE is decided by RLS (budget + expenses via
// is_parent_member, notes via 033) and attack-tested on staging — see
// docs/FINAL_PASS_REPORT.md. What this file pins is the app's half: no
// route accepts a parent's write to player data, no parent screen offers
// one, and a parent's Settings is about the parent.

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PLAYER_DATA_WRITE_ROUTES = [
  "app/api/utr-entries/route.ts",
  "app/api/matches/route.ts",
  "app/api/outreach/route.ts",
  // The training calendar's only write route (per-row, manual plan only).
  // /api/training/planner and /templates were deleted with the generator.
  "app/api/training/sessions/route.ts",
];

describe("server: no player-data write route accepts a parent", () => {
  for (const route of PLAYER_DATA_WRITE_ROUTES) {
    it(route, () => {
      const src = read(route);
      const post = src.slice(src.indexOf("export async function POST"));
      const refuse = post.indexOf("await refuseParentPlayerDataWrite(ctx)");
      expect(refuse, "must call refuseParentPlayerDataWrite").toBeGreaterThan(-1);
      // ...and act on it before anything is written or parsed.
      expect(post.slice(refuse, refuse + 160)).toMatch(/if \(parentRefusal\) return parentRefusal;/);
      for (const later of ["safeParse(", "await save", "await create", "await upsert", "rateLimited("]) {
        const at = post.indexOf(later);
        if (at > -1) expect(at, `${later} runs before the parent check`).toBeGreaterThan(refuse);
      }
    });
  }

  it("every API route that writes a player table is in the list above", () => {
    // Enumerated from app/api, not listed by hand: a NEW route importing a
    // player-data writer passed the old hand-written list because the list
    // never mentioned it (verifier, 2026-11-16).
    const PLAYER_TABLES =
      /from\(\s*["'](utr_entries|matches|coach_outreach|tournament_entries|training_plans|workout_sessions|saved_templates|session_exercises|exercises|daily_checkins|recruiting_checklist_items|cost_calculations)["']\s*\)/;
    const PLAYER_WRITER_IMPORT = /from\s+["']@\/lib\/db\/(events|outreach|plan|plan-data-training-plans|training|checkins|checklist|cost)["']/;
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
        else if (name === "route.ts") routes.push(rel);
      }
    };
    walk("app/api");
    expect(routes.length).toBeGreaterThan(10);
    for (const route of routes) {
      const src = read(route);
      const writes = /export async function (POST|PUT|PATCH|DELETE)\b/.test(src);
      if (writes && (PLAYER_WRITER_IMPORT.test(src) || PLAYER_TABLES.test(src))) {
        expect(PLAYER_DATA_WRITE_ROUTES, `${route} writes player data`).toContain(route);
      }
    }
  });

  it("/api/profile writes only a parent's name, with the role read from the database", () => {
    const src = read("app/api/profile/route.ts");
    const branch = src.slice(src.indexOf('if (own?.role === "parent")'));
    expect(branch.length).toBeGreaterThan(0);
    const body = branch.slice(0, branch.indexOf("return NextResponse.json({ ok: true });"));
    expect(body).toMatch(/\.update\(\{ name \}\)\.eq\("id", ctx\.user\.id\)/);
    expect(body).not.toMatch(/writeCurrentPlayerProfile|current_utr|gpa|graduation_year/);
    // role comes from the caller's own row, not from the posted body
    expect(src).toMatch(/\.select\("role, subscription_tier"\)\s*\.eq\("id", ctx\.user\.id\)/);
    expect(src).not.toMatch(/parsed\.data\.role\s*===\s*"parent"/);
  });
});

describe("client: a parent's screens offer no player edit", () => {
  it("/settings sends a parent to the parent's own Settings, in both designs", () => {
    const src = read("components/settings/settings-view.tsx");
    const inner = src.slice(src.indexOf("function SettingsInner"));
    const parentReturn = inner.indexOf('if (player.role === "parent") return <ParentSettingsView section={parentSection} fromOnboarding={fromOnboarding} />;');
    expect(parentReturn).toBeGreaterThan(-1);
    expect(parentReturn).toBeLessThan(inner.indexOf("<SeededSettingsView"));
    expect(parentReturn).toBeLessThan(inner.indexOf("<LegacySettingsView"));
  });

  it("the parent Settings renders no player-stat field", () => {
    // Comments explain what used to be here; only code counts.
    const src = read("components/seeded/settings/parent-settings-view.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/(?<![A-Za-z])(ProfileCard|AccountCard)\b|<NotificationsCard/);
    // Every card it renders is one of these. A blocklist of names was
    // beaten by <PlayerProfileCard /> (verifier, 2026-11-16).
    const cards = new Set([...src.matchAll(/<([A-Z]\w*Card)\b/g)].map((m) => m[1]));
    for (const card of cards) {
      expect(["ParentAccountCard", "LinkedPlayersCard", "AppearanceCard", "PrivacyCard", "FamilyMembersCard"]).toContain(card);
    }
    // One editable field: the parent's own name.
    expect(src.match(/<(input|Input|select|textarea|Select|Textarea)\b/g)?.length ?? 0).toBeLessThanOrEqual(1);
    // labels and fields a parent must never see as their own
    for (const banned of [/UTR profile link/i, /\bGPA\b/, /grad(?:uation)? year/i, /\bUTR\b/, /"Team"/, /utrProfileLink|currentUTR|\.gpa\b/]) {
      expect(src).not.toMatch(banned);
    }
  });

  it("stars and Save-to-targets are hidden for a parent and inert if reached", () => {
    const hook = read("lib/hooks/use-star-schools.ts");
    expect(hook).toMatch(/const canStar = player\.role !== "parent";/);
    expect(hook).toMatch(/if \(!canStar\) return;[\s\S]*if \(!canStar\) return;/);
    for (const f of [
      "components/seeded/schools/seeded-schools-browser.tsx",
      "components/seeded/schools/seeded-school-detail.tsx",
    ]) {
      const src = read(f);
      const stars = src.split("<StarButton").length - 1;
      const guarded = src.split(/\{canStar && \(\s*<StarButton/).length - 1;
      expect(guarded, `${f}: every StarButton behind canStar`).toBe(stars);
      for (const m of src.matchAll(/Save to targets/g)) {
        const lineStart = src.lastIndexOf("\n", m.index) + 1;
        if (/^\s*\/\//.test(src.slice(lineStart, m.index))) continue; // a comment
        const before = src.slice(Math.max(0, (m.index ?? 0) - 700), m.index);
        expect(before, `${f}: "Save to targets" outside canStar`).toMatch(/canStar && \(/);
      }
    }
  });

  it("/tournament-fit offers a parent no 'Add to my events'", () => {
    const src = read("components/seeded/tournament-fit/seeded-tournament-fit-view.tsx");
    const at = src.indexOf(">Add to my events<");
    expect(src.slice(at - 200, at)).toMatch(/player\.role !== "parent" && \(/);
  });
});
