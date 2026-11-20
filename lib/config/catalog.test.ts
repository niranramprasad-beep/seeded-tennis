import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Catalog phase 1. Off must mean /schools is unchanged. Source-level, like
// components/auth/google-button-flag.test.ts and for the same reason: the
// NEXT_PUBLIC_ flag is inlined at build time, so a render test that sets
// process.env afterwards would be testing nothing.

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("the catalog phase-1 flag", () => {
  it("reads the flag strictly — only the exact string \"true\"", () => {
    expect(read("lib", "config", "catalog.ts")).toContain(
      'process.env.NEXT_PUBLIC_CATALOG_PHASE1_ENABLED === "true"'
    );
  });

  it("/schools renders the imported section only behind the flag", () => {
    const page = read("app", "schools", "page.tsx");
    expect(page).toContain("{CATALOG_PHASE1_ENABLED ? <ImportedProgramsSection /> : null}");
    // Exactly one mention of the component outside its import.
    expect(page.match(/<ImportedProgramsSection/g)).toHaveLength(1);
  });

  it("nothing else renders the section or queries the catalog tables", () => {
    const section = execSync(
      "grep -rln 'ImportedProgramsSection' --include='*.ts' --include='*.tsx' app components lib || true",
      { cwd: ROOT, encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.endsWith(".test.ts"))
      .sort();
    expect(section).toEqual(["app/schools/page.tsx", "components/schools/imported-programs-section.tsx"]);

    const loaders = execSync(
      "grep -rlnE \"loadImportedPrograms|from\\(\\s*['\\\"](programs|program_class_counts|team_ranges)['\\\"]\" --include='*.ts' --include='*.tsx' app components lib || true",
      { cwd: ROOT, encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.endsWith(".test.ts"))
      .sort();
    expect(loaders).toEqual([
      "components/admin/team-range-admin.tsx",
      "components/schools/imported-programs-section.tsx",
      "lib/db/programs.ts",
    ]);
  });

  it("the section never decides a fit band itself", () => {
    const src = read("components", "schools", "imported-programs-section.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/classifySchoolFit|countBands|bandableRange|fitBasis/);
  });
});
