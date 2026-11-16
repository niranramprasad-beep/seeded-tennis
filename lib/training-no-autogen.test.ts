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

// `lib` is here because it was not, and that was the whole defeat: a
// verifier added lib/training-autofill.ts, imported the exported generator
// from training-view.tsx, and called it from applyPreferences. Every
// assertion passed, because none of them looked at lib/.
const UI_ROOTS = ["components", "app", "lib"];
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

  it("no control offers to fill a week on the player's behalf", () => {
    // M7 from the final verification: a sidebar item relabelled "Fill my
    // week for me", wired to applyTemplate("build"), wrote seven
    // Seeded-authored sessions in one click with the suite green. The
    // guard only knew the identifier `generatePersonalizedPlan` and the
    // word "generate".
    //
    // Templates themselves STAY — Niran's call: a player choosing a
    // template is choosing, which is what "manual" means. What must not
    // exist is a control that does it FOR them.
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = strippedSource(f);
      // First draft used /for me|for you|automatically|ready-made week/
      // and flagged nine innocents ("Sorted by fit for you", "How Seeded
      // decides which teams are realistic for you"). It also flagged the
      // Templates drawer's "Replaces your active plan with a ready-made
      // week" — which STAYS, because a player picking a template is
      // choosing, and that is what manual means.
      //
      // The banned shape is narrower: a control offering to fill the
      // calendar on the player's behalf.
      for (const m of src.matchAll(
        /["'`>]([^"'`<>{}]{0,50}?(?:fill (?:my|your|in your) (?:week|calendar|plan|schedule)|(?:build|make|create|plan|write) (?:my|your) (?:week|plan|schedule)[^"'`<>{}]{0,12}for me|do it for me|auto-?fill|automatically (?:build|create|fill|plan|generate|add))[^"'`<>{}]{0,30})/gi
      )) {
        offenders.push(`${f}: "${m[1].trim().slice(0, 60)}"`);
      }
    }
    expect(
      offenders,
      "a control that fills the calendar FOR the player is the banned thing, whatever it is called"
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

  it("the generator is not exported, so no other module can reach it", () => {
    // The identifier-count check above only covers files this test walks.
    // Not exporting it is the part that holds regardless: there is no way
    // to import what is not exported, so a new file in any root — scanned
    // or not — cannot call it.
    const src = strippedSource(DEFINITION_FILE);
    expect(src, "un-export it; it is deleted in week 1 anyway").not.toMatch(
      /export\s+(?:async\s+)?function\s+generatePersonalizedPlan\b/
    );
    expect(src).not.toMatch(/export\s*\{[^}]*\bgeneratePersonalizedPlan\b/);
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
