import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Bug hunt 2026-11-26, BUG-002: "Start check-in", "Log check-in" (Today) and
// the paid-feature list drew lucide's Sparkles, the generic "AI product"
// icon, next to ordinary actions. tools/design_lint.mjs bans the whole family
// (sparkles, magic wands, stars); this keeps them out of the source so the
// design_lint FAIL cannot come back unnoticed.

const ROOT = join(__dirname, "..");
const BANNED = /^(Sparkles?|SparklesIcon|WandSparkles|Wand2?|MagicWand|IconSparkles|IconWand|Stars)$/;
const ICON_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*["'](?:lucide-react|@phosphor-icons\/react|react-icons[^"']*|@heroicons[^"']*|@tabler\/icons-react)["']/g;

/** The banned icon names a source text imports (an `X as Y` alias still counts as X). */
function bannedIconImports(src: string): string[] {
  const found: string[] = [];
  for (const m of src.matchAll(ICON_IMPORT)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (BANNED.test(name)) found.push(name);
    }
  }
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("no sparkle or magic-wand icons", () => {
  it("the detector catches every spelling (self-test)", () => {
    for (const s of [
      'import { Sparkles } from "lucide-react";',
      'import { Lock, Sparkles } from "lucide-react";',
      'import { Sparkle } from "lucide-react";',
      'import { WandSparkles } from "lucide-react";',
      'import { Wand2 } from "lucide-react";',
      'import { Stars as Decoration } from "lucide-react";',
      'import {\n  Check,\n  Sparkles as Glitter,\n} from "lucide-react";',
      "import { IconSparkles } from '@tabler/icons-react';",
    ]) {
      expect(bannedIconImports(s).length, s).toBeGreaterThan(0);
    }
    for (const s of [
      'import { CalendarCheck } from "lucide-react";',
      'import { Check, Lock } from "lucide-react";',
      'import { SparklesBadge } from "@/components/x";',
      'import { Sparkles } from "./not-an-icon-library";',
    ]) {
      expect(bannedIconImports(s), s).toEqual([]);
    }
  });

  it("no file in app/, components/ or lib/ imports one", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of walk(join(ROOT, dir))) {
        const bad = bannedIconImports(readFileSync(file, "utf8"));
        if (bad.length) offenders.push(`${file.slice(ROOT.length + 1).replace(/\\/g, "/")}: ${bad.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
