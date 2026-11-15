import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// CLAUDE.md, non-negotiable: "No auto-generated training plans — manual
// calendar only."
//
// That rule was broken in shipped code for as long as it has existed, and
// an independent verifier is what finally produced the line number:
// components/training/training-view.tsx had a button labelled "Generate my
// training week" wired through `applyPreferences` to
// `generatePersonalizedPlan()`, which wrote a full week of sessions Seeded
// invented ("Serve plus first-ball patterns", "Filmed set play"). Finishing
// the setup questionnaire produced a training plan the player had never
// asked for and could not distinguish from one they had written.
//
// The UI entry point is gone. The FUNCTION is still in the file on purpose
// — removing it is docs/TODO.md week-1 item #2, kept separate so that diff
// is reviewable on its own — which is exactly the state in which someone
// re-wires a button to it by accident. Hence this test.
//
// It is a source scan, so it is a lint and not a proof: it can tell you no
// UI file names the generator, not that nothing ever auto-fills a calendar.
// It is mutation-tested below against the real call site that shipped.

const UI_ROOTS = ["components", "app"];
const EXTS = [".ts", ".tsx"];

/** The generator's own definition lives here; everything else is a caller. */
const DEFINITION_FILE = "components/training/training-view.tsx";

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (EXTS.some((e) => entry.endsWith(e)) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

// Comments quote the removed call deliberately — that note is the main
// defence against someone restoring it — so only live code is scanned.
function strippedSource(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const FILES = UI_ROOTS.flatMap((r) => sourceFiles(r));

describe("no UI path auto-generates a training plan", () => {
  it("finds the UI source tree", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("nothing references generatePersonalizedPlan at all, except its definition", () => {
    // First version banned `generatePersonalizedPlan(` — a CALL. Mutation
    // testing caught that immediately: `const sneaky = () =>
    // generatePersonalizedPlan;` passes the function along as a value and
    // never matches, so a caller one hop away was invisible. A function
    // that is reachable is a function that gets called.
    //
    // So: the identifier may appear ONCE in the whole UI tree, on the line
    // that defines it. An import, a re-export, an alias, a callback, a
    // property on an options object — all fail.
    const mentions: string[] = [];
    for (const f of FILES) {
      const src = strippedSource(f);
      for (const m of src.matchAll(/\bgeneratePersonalizedPlan\b/g)) {
        const line = src.slice(0, m.index!).split("\n").length;
        const isDefinition =
          f === DEFINITION_FILE &&
          /(?:export\s+)?(?:async\s+)?function\s*$/.test(src.slice(Math.max(0, m.index! - 32), m.index!));
        if (!isDefinition) mentions.push(`${f}:${line}`);
      }
    }
    expect(
      mentions,
      "the calendar is filled in by hand — see docs/TODO.md week-1 item #2"
    ).toEqual([]);
  });

  it("no button offers to generate a week", () => {
    const offenders = FILES.filter((f) =>
      /generate (?:my |your |a )?(?:training )?(?:week|plan|schedule)/i.test(strippedSource(f))
    );
    expect(offenders, "a control that offers to produce a plan for the player").toEqual([]);
  });

  it("the generator is defined in exactly one place, so there is one thing to delete", () => {
    const definers = FILES.filter((f) =>
      /function\s+generatePersonalizedPlan\s*\(/.test(strippedSource(f))
    );
    expect(definers).toEqual([DEFINITION_FILE]);
  });

  it("completing the setup questionnaire stores preferences and nothing else", () => {
    const src = strippedSource(DEFINITION_FILE);
    const m = src.match(/const applyPreferences = \([^)]*\) => \{([\s\S]*?)\n  \};/);
    expect(m, "applyPreferences not found — did it get renamed?").not.toBeNull();
    const body = m![1];
    expect(body).not.toMatch(/generatePersonalizedPlan/);
    // It may set preferences; it may not write sessions or plans.
    expect(body, "the questionnaire must not write sessions").not.toMatch(/sessions:/);
    expect(body, "the questionnaire must not write plans").not.toMatch(/plans:/);
  });
});
