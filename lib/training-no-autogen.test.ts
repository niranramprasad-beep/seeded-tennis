import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// CLAUDE.md, non-negotiable: "No auto-generated training plans — manual
// calendar only."
//
// History, because the shape of the defeats is the point of this file:
//  - components/training/training-view.tsx had "Generate my training week"
//    wired to generatePersonalizedPlan(), which wrote a week of sessions
//    Seeded invented. The button went; the function stayed "to be deleted
//    in week 1", guarded by an identifier scan.
//  - A verifier re-wired it from lib/ (not scanned then); another relabelled
//    a template control "Fill my week for me". Both passed the suite.
//  - The production sweep (2026-11-18) found it still live a different way:
//    /events' "Add session" opened the whole legacy planner in a drawer —
//    "6h personalized recruiting week", "UTR build week", "Add suggested
//    session". Production holds 28 sessions in 5 generator-named plans.
//
// So the generator, its templates, the planner, Match mode's prep-plan
// generator and the whole-state save are DELETED, not guarded. This file
// fails the build if any of them, or anything shaped like them, returns.
// It is a source scan: a lint, not a proof. The self-tests below are the
// mutation tests — each detector is shown catching the thing that shipped.

const ROOTS = ["components", "app", "lib"];
const EXTS = [".ts", ".tsx"];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (EXTS.some((e) => entry.endsWith(e)) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

// Comments quote the removed names deliberately — that history is the main
// defence against someone restoring them — so only live code is scanned.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}
const strippedSource = (file: string) => stripComments(readFileSync(file, "utf8"));

const FILES = ROOTS.flatMap((r) => sourceFiles(r));

/** Identifiers of the deleted generators. Any mention in live code — a
 * definition, an import, a value passed along — fails. */
export const BANNED_IDENTIFIERS = [
  "generatePersonalizedPlan",
  "makeGeneratedSession",
  "buildTemplateSessions",
  "TEMPLATE_DEFINITIONS",
  "applyTemplate",
  "applyPreferences",
  "generatePrepPlan",
  "TrainingView",
  "MatchModeView",
  "saveTrainingPlannerState",
  "loadTrainingPlannerState",
  "saveTrainingTemplate",
];

/** Copy that offers to plan FOR the player. */
export const BANNED_COPY: RegExp[] = [
  /generate (?:my |your |a )?(?:training |prep )?(?:week|plan|schedule)/i,
  /\bsuggested session/i,
  /\bpersonali[sz]ed (?:\w+ )?(?:recruiting )?week\b/i,
  /\bUTR build week\b/i,
  /\bbuild week\b/i,
  /fill (?:my|your|in your) (?:week|calendar|plan|schedule)/i,
  /(?:build|make|create|plan|write) (?:my|your) (?:week|plan|schedule)[^"'`<>{}]{0,12}for me/i,
  /\bdo it for me\b/i,
  /\bauto-?fill\b/i,
  /automatically (?:build|create|fill|plan|generate|add)/i,
];

function identifierHits(src: string): string[] {
  return BANNED_IDENTIFIERS.filter((id) => new RegExp(`\\b${id}\\b`).test(src));
}

function copyHits(src: string): string[] {
  return BANNED_COPY.filter((re) => re.test(src)).map(String);
}

describe("detectors catch what actually shipped (self-test)", () => {
  it("the identifier scan catches a call, an import, and a function passed as a value", () => {
    expect(identifierHits("const week = generatePersonalizedPlan(prefs);")).toContain("generatePersonalizedPlan");
    expect(identifierHits('import { generatePrepPlan } from "@/lib/db/events";')).toContain("generatePrepPlan");
    expect(identifierHits("const sneaky = () => buildTemplateSessions;")).toContain("buildTemplateSessions");
    expect(identifierHits("<TrainingView plans={plans} />")).toContain("TrainingView");
    expect(identifierHits(stripComments("// generatePersonalizedPlan was here"))).toEqual([]);
  });

  it("the copy scan catches the labels from the sweep and the earlier verifier", () => {
    for (const s of [
      "Generate my training week",
      "Generate prep plan",
      "Add suggested session",
      "6h personalized recruiting week",
      "UTR build week",
      "5.5 UTR build week",
      "Fill my week for me",
    ]) {
      expect(copyHits(s).length, s).toBeGreaterThan(0);
    }
    for (const s of ["Add session", "Repeat every week", "Only sessions you add. Nothing is planned for you."]) {
      expect(copyHits(s), s).toEqual([]);
    }
  });

  it("comment stripping keeps code and drops comments", () => {
    expect(stripComments("// generatePrepPlan\nconst x = 1;")).not.toMatch(/generatePrepPlan/);
    expect(stripComments("/* applyTemplate */ const y = 2;")).not.toMatch(/applyTemplate/);
  });
});

describe("no path in the app auto-generates a training plan", () => {
  it("finds the source tree", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("no live code names a deleted generator, planner or Match mode", () => {
    const hits = FILES.flatMap((f) => identifierHits(strippedSource(f)).map((id) => `${f}: ${id}`));
    expect(hits, "the calendar is filled in by hand — see docs/DECISIONS.md 2026-11-18").toEqual([]);
  });

  it("no control offers to plan, suggest or fill a week on the player's behalf", () => {
    const hits = FILES.flatMap((f) => copyHits(strippedSource(f)).map((re) => `${f}: ${re}`));
    expect(hits).toEqual([]);
  });

  it("the deleted modules stay deleted", () => {
    for (const f of [
      "components/training/training-view.tsx",
      "components/matches/match-mode-view.tsx",
      "components/seeded/training",
      "app/api/training/planner/route.ts",
      "app/api/training/templates/route.ts",
    ]) {
      expect(existsSync(f), `${f} was deleted with the generator`).toBe(false);
    }
  });

  it("/training and /match-mode only redirect", () => {
    for (const [file, to] of [
      ["app/training/page.tsx", "/events"],
      ["app/match-mode/page.tsx", "/matches"],
    ] as const) {
      const src = strippedSource(file);
      expect(src).toMatch(new RegExp(`redirect\\("${to}"\\)`));
      expect(src, `${file} renders something besides the redirect`).not.toMatch(/<[A-Z]/);
    }
  });

  it("the training data layer writes one row at a time, inside the manual plan", () => {
    const src = strippedSource("lib/db/training.ts");
    // The old whole-state save deleted every session it was not handed:
    // `.not("id", "in", …)`. With generated rows hidden from the UI, one
    // ordinary save would have deleted them all.
    expect(src).not.toMatch(/\.not\(\s*["']id["']\s*,\s*["']in["']/);
    // Every update and delete is scoped to the manual plan as well as the owner.
    const writes = [...src.matchAll(/\.(update|delete)\(/g)].length;
    const scoped = [...src.matchAll(/\.in\(\s*["']training_plan_id["']\s*,\s*planIds\s*\)/g)].length;
    expect(writes).toBeGreaterThan(0);
    // One scoped read, plus one per update/delete.
    expect(scoped).toBeGreaterThanOrEqual(writes + 1);
    expect(src).toMatch(/contains\(\s*["']metadata["']\s*,\s*MANUAL_PLAN_METADATA\s*\)/);
  });

  it("the only training write route is the per-row one", () => {
    expect(existsSync("app/api/training/sessions/route.ts")).toBe(true);
    const dirs = readdirSync("app/api/training");
    expect(dirs).toEqual(["sessions"]);
  });
});
