import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { FIT_ENGINE_FILES, FIT_ENTRY_FILE } from "./fit/engine-files";

// THE fit.ts SPLIT WAS A PURE MOVE — and stays one until someone means
// otherwise.
//
// lib/fit.ts was one 1,345-line file. On 2026-11-21 it was split into
// lib/fit/{pace,projection,goal,bands,diagnostic}.ts with lib/fit.ts left as
// a barrel, so no importer changed. A move that silently edits a body is the
// risk, so before anything moved, every top-level statement of the original
// (except imports) was hashed — its exact text INCLUDING its leading JSDoc and
// section banners — into lib/fit/__split-manifest.json. This test asserts:
//   - every one of those statements exists byte-identically in exactly one
//     engine file, and the engine declares nothing else;
//   - the barrel only re-exports, and exports exactly the original's names
//     (checked from its source AND from the loaded module);
//   - lib/fit/ holds exactly the files lib/fit/engine-files.ts lists (that
//     list is what the guard tests treat as "lib/fit.ts");
//   - imports between the engine files run one way, never through the barrel;
//   - nothing outside the engine imports lib/fit/* — "@/lib/fit" only.
//
// CHANGING A FIT DECLARATION ON PURPOSE fails the hash check, by design: it
// is a snapshot of the engine. Re-record it like a snapshot, in the same
// commit as the change, and say so in the PR:
//
//   FIT_SPLIT_MANIFEST_FROM=engine npx vitest run lib/fit-split-purity.test.ts
//
// (The original was recorded with FIT_SPLIT_MANIFEST_FROM=<path to
// `git show 5c57deb:lib/fit.ts`>.)

const MANIFEST = "lib/fit/__split-manifest.json";
const ENGINE_DIR = "lib/fit";
// In lib/fit/ but not engine code: the guard tests' list itself.
const NOT_ENGINE = ["lib/fit/engine-files.ts"];
const SUBMODULES = FIT_ENGINE_FILES.filter((f) => f !== FIT_ENTRY_FILE);

interface Decl {
  names: string[];
  kind: string;
  exported: boolean;
  sha256: string;
}

interface ExportList {
  values: string[];
  types: string[];
}

interface Manifest {
  about: string;
  source: string;
  sourceSha256: string | null;
  exports: ExportList;
  declarations: Decl[];
}

function parse(file: string, src: string = readFileSync(file, "utf8")): ts.SourceFile {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function isExported(s: ts.Statement): boolean {
  if (ts.isExportDeclaration(s)) return true;
  return ts.canHaveModifiers(s) && (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function namesOf(s: ts.Statement): string[] {
  if (ts.isVariableStatement(s)) return s.declarationList.declarations.map((d) => d.name.getText());
  if (ts.isExportDeclaration(s)) {
    return s.exportClause && ts.isNamedExports(s.exportClause) ? s.exportClause.elements.map((e) => e.name.text) : ["*"];
  }
  const name = (s as { name?: ts.Node }).name;
  return name ? [name.getText()] : [];
}

/** Every top-level statement except imports and a barrel's `export … from`,
 * hashed over its exact text including leading comments (only the blank
 * lines before it are dropped). */
function declarationsOf(file: string, src?: string): Decl[] {
  const sf = parse(file, src);
  return sf.statements
    .filter((s) => !ts.isImportDeclaration(s) && !(ts.isExportDeclaration(s) && s.moduleSpecifier))
    .map((s) => ({
      names: namesOf(s),
      kind: ts.isVariableStatement(s) ? "VariableStatement" : ts.SyntaxKind[s.kind],
      exported: isExported(s),
      sha256: createHash("sha256").update(s.getFullText(sf).replace(/^\s+/, "")).digest("hex"),
    }));
}

function exportsOf(decls: Decl[]): ExportList {
  const values: string[] = [];
  const types: string[] = [];
  for (const d of decls) {
    if (!d.exported) continue;
    (d.kind === "InterfaceDeclaration" || d.kind === "TypeAliasDeclaration" ? types : values).push(...d.names);
  }
  return { values: values.sort(), types: types.sort() };
}

/** The barrel, read as source: what it re-exports, from where, and anything
 * in it that is not a plain re-export. */
function readBarrel() {
  const sf = parse(FIT_ENTRY_FILE);
  const values: string[] = [];
  const types: string[] = [];
  const from: string[] = [];
  const other: string[] = [];
  for (const s of sf.statements) {
    if (!ts.isExportDeclaration(s) || !s.moduleSpecifier || !s.exportClause || !ts.isNamedExports(s.exportClause)) {
      other.push(s.getText(sf).slice(0, 80));
      continue;
    }
    from.push((s.moduleSpecifier as ts.StringLiteral).text);
    for (const e of s.exportClause.elements) {
      if (e.propertyName) other.push(`renamed: ${e.propertyName.text} as ${e.name.text}`);
      (s.isTypeOnly || e.isTypeOnly ? types : values).push(e.name.text);
    }
  }
  return { values: values.sort(), types: types.sort(), from, other };
}

function engineFileFor(specifier: string, importer: string): string | null {
  if (specifier === "@/lib/fit") return FIT_ENTRY_FILE;
  if (specifier.startsWith("@/lib/fit/")) return `lib/fit/${specifier.slice("@/lib/fit/".length)}.ts`;
  if (importer.startsWith(`${ENGINE_DIR}/`) && specifier.startsWith("./")) return `${ENGINE_DIR}/${specifier.slice(2)}.ts`;
  if (importer.startsWith(`${ENGINE_DIR}/`) && specifier === "../fit") return FIT_ENTRY_FILE;
  return null;
}

function importsOf(file: string): string[] {
  const sf = parse(file);
  const out: string[] = [];
  for (const s of sf.statements) {
    if ((ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier) {
      out.push((s.moduleSpecifier as ts.StringLiteral).text);
    }
  }
  return out;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

const sameDecl = (a: Decl, b: Decl) =>
  a.sha256 === b.sha256 && a.kind === b.kind && a.exported === b.exported && a.names.join(",") === b.names.join(",");

/* ------------------------------------------------- recording the manifest */

const RECORD_FROM = process.env.FIT_SPLIT_MANIFEST_FROM;

// Registered only while recording, so the normal run shows no skipped test.
if (RECORD_FROM) describe("record the manifest (FIT_SPLIT_MANIFEST_FROM is set)", () => {
  it("writes lib/fit/__split-manifest.json", () => {
    const fromEngine = RECORD_FROM === "engine";
    const declarations = fromEngine
      ? SUBMODULES.flatMap((f) => declarationsOf(f))
      : declarationsOf("lib/fit.ts", readFileSync(RECORD_FROM as string, "utf8"));
    const barrel = fromEngine ? readBarrel() : null;
    const manifest: Manifest = {
      about:
        "Every top-level statement of lib/fit.ts (imports excepted), hashed with its leading comments. lib/fit-split-purity.test.ts checks the engine files against it. Re-record with FIT_SPLIT_MANIFEST_FROM=engine only when a fit declaration changed on purpose.",
      source:
        process.env.FIT_SPLIT_MANIFEST_SOURCE ??
        (fromEngine ? "the fit engine files (lib/fit.ts + lib/fit/*.ts)" : (RECORD_FROM as string)),
      sourceSha256: fromEngine
        ? null
        : createHash("sha256").update(readFileSync(RECORD_FROM as string)).digest("hex"),
      exports: barrel ? { values: barrel.values, types: barrel.types } : exportsOf(declarations),
      declarations,
    };
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  });
});

/* ------------------------------------------------------------ the checks */

describe.skipIf(!!RECORD_FROM)("the fit.ts split is a pure move", () => {
  // Read only when checking: while recording, the files may not exist yet.
  const manifest = RECORD_FROM ? ({} as Manifest) : (JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest);
  const found = RECORD_FROM ? [] : SUBMODULES.flatMap((file) => declarationsOf(file).map((d) => ({ file, d })));

  it("the manifest is the whole original file", () => {
    expect(manifest.declarations.length).toBeGreaterThan(50);
    expect(manifest.exports.values).toContain("buildFitReport");
    expect(manifest.exports.types).toContain("FitReport");
  });

  it("every original declaration is in exactly one engine file, byte-identical, comments included", () => {
    const problems: string[] = [];
    for (const want of manifest.declarations) {
      const where = found.filter(({ d }) => sameDecl(d, want)).map(({ file }) => file);
      if (where.length !== 1) problems.push(`${want.names.join(",")} (${want.kind}): found ${where.length}× ${where.join(" ")}`);
    }
    expect(problems, "a moved declaration was edited, dropped or duplicated").toEqual([]);
  });

  it("the engine declares nothing the original did not", () => {
    const extra = found
      .filter(({ d }) => !manifest.declarations.some((want) => sameDecl(d, want)))
      .map(({ file, d }) => `${file}: ${d.names.join(",")} (${d.kind})`);
    expect(extra).toEqual([]);
    expect(found.length).toBe(manifest.declarations.length);
  });

  it("the barrel only re-exports, from lib/fit/*, without renaming", () => {
    const barrel = readBarrel();
    expect(barrel.other, `${FIT_ENTRY_FILE} must hold nothing but re-exports`).toEqual([]);
    expect(declarationsOf(FIT_ENTRY_FILE)).toEqual([]);
    for (const spec of barrel.from) {
      expect(SUBMODULES, spec).toContain(engineFileFor(spec, FIT_ENTRY_FILE));
    }
  });

  it("the barrel's export list is the original's, read from source", () => {
    const barrel = readBarrel();
    expect(barrel.values).toEqual([...manifest.exports.values].sort());
    expect(barrel.types).toEqual([...manifest.exports.types].sort());
  });

  it("the loaded module exports exactly the original's values", async () => {
    const mod = await import("./fit");
    expect(Object.keys(mod).sort()).toEqual([...manifest.exports.values].sort());
  });

  it("lib/fit/ holds exactly the files engine-files.ts lists", () => {
    const onDisk = readdirSync(ENGINE_DIR)
      .filter((e) => /\.tsx?$/.test(e) && !e.includes(".test."))
      .map((e) => `${ENGINE_DIR}/${e}`)
      .filter((f) => !NOT_ENGINE.includes(f))
      .sort();
    expect(onDisk).toEqual([...SUBMODULES].sort());
  });

  it("imports between engine files run one way, and never through the barrel", () => {
    const edges = new Map<string, string[]>();
    for (const file of SUBMODULES) {
      const deps = importsOf(file)
        .map((spec) => engineFileFor(spec, file))
        .filter((f): f is string => f != null);
      expect(deps, `${file} imports the barrel`).not.toContain(FIT_ENTRY_FILE);
      edges.set(file, deps);
    }
    const cycles: string[] = [];
    const visit = (file: string, stack: string[]) => {
      if (stack.includes(file)) {
        cycles.push([...stack.slice(stack.indexOf(file)), file].join(" → "));
        return;
      }
      for (const dep of edges.get(file) ?? []) visit(dep, [...stack, file]);
    };
    for (const file of SUBMODULES) visit(file, []);
    expect(cycles).toEqual([]);
  });

  it('nothing outside the engine imports lib/fit/* — "@/lib/fit" only', () => {
    const offenders: string[] = [];
    for (const file of ["lib", "app", "components"].flatMap((d) => sourceFiles(d))) {
      if (FIT_ENGINE_FILES.includes(file)) continue;
      // Static imports/re-exports and dynamic import()s alike.
      const specs = [...readFileSync(file, "utf8").matchAll(/(?:\bfrom|\bimport\s*\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of specs) {
        if (spec.startsWith("@/lib/fit/") || /(^|\/)fit\/(pace|projection|goal|bands|diagnostic)$/.test(spec)) {
          offenders.push(`${file} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
