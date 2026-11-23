import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { schoolLogoFile, universityKey } from "./school-logos";

// School logos are other people's trademarks on a site that sells something.
// The rules are in docs/SCHOOL_LOGOS.md; this holds the ones a file can show.

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");
const DIR = join(ROOT, "public", "school-logos");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

const entries = [...read("lib/school-logos.ts").matchAll(/^ {2}"?([a-z-]+)"?: "(s[0-9a-f]{10}\.webp)",$/gm)].map((m) => ({
  key: m[1],
  file: m[2],
}));
const slugs = readdirSync(join(ROOT, "lib", "db"))
  .filter((f) => /^schools-data.*\.ts$/.test(f) && !f.includes(".test."))
  .flatMap((f) => [...read(`lib/db/${f}`).matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]));
const doc = read("docs/SCHOOL_LOGOS.md");

/** Width and height from a WebP header (lossy, lossless or extended). */
function webpSize(b: Buffer): [number, number] | null {
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  return kind === "VP8 " ? [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff] : null;
}

describe("school logos: every picture is small, sourced and used", () => {
  it("finds the map, the files and the catalog (guards a vacuous sweep)", () => {
    expect(entries.length).toBeGreaterThan(10);
    expect(slugs.length).toBeGreaterThanOrEqual(68);
    expect(entries.length).toBe((read("lib/school-logos.ts").match(/\.webp"/g) ?? []).length);
  });

  it("every entry has its file and every file its entry", () => {
    expect(readdirSync(DIR).sort()).toEqual(entries.map((e) => e.file).sort());
  });

  it("each is a 144 px WebP tile under 12 KB: never a vector, never a large copy", () => {
    for (const e of entries) {
      const b = readFileSync(join(DIR, e.file));
      expect(webpSize(b), e.key).toEqual([144, 144]);
      expect(b.length, e.key).toBeLessThan(12 * 1024);
    }
  });

  it("each has a source row that says where it came from and that it is public domain", () => {
    for (const e of entries) {
      const row = doc.split("\n").find((l) => l.includes(`\`${e.file}\``)) ?? "";
      expect(row, e.key).toMatch(/\]\(https:\/\/commons\.wikimedia\.org\/wiki\/File:[^)]+/);
      expect(row, e.key).toMatch(/\| Public domain \|/);
    }
  });

  it("each is a school in the catalog, the same one for its men's and women's teams", () => {
    const keys = new Set(slugs.map(universityKey));
    for (const e of entries) {
      expect(keys.has(e.key), e.key).toBe(true);
      expect(schoolLogoFile(`${e.key}-w`)).toBe(schoolLogoFile(e.key));
      expect(schoolLogoFile(`${e.key}-m`)).toBe(schoolLogoFile(e.key));
    }
  });

  it("a school we have no logo for gets none, and only the team suffix is dropped", () => {
    expect(schoolLogoFile("not-a-school")).toBeNull();
    expect(universityKey("michigan-state-w")).toBe("michigan-state");
    expect(universityKey("georgia-tech")).toBe("georgia-tech");
    expect(schoolLogoFile("michigan-state-w")).toBeNull();
    expect(schoolLogoFile("georgia-tech")).toBeNull();
  });
});

describe("school logos: shown to name a school, and awkward to copy", () => {
  it("the tile is an inert background over the initials, never an <img>", () => {
    const code = read("components/seeded/ui/school-mark.tsx").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/<img\b|next\/image|<svg\b/);
    expect(code).toMatch(/pointer-events-none/);
    expect(code).toMatch(/backgroundImage/);
    expect(code).toMatch(/aria-hidden/);
    expect((code.match(/<SchoolMonogram\b/g) ?? []).length).toBe(2);
  });

  it("only the school list and the school page show one", () => {
    const users = ["components", "app", "lib"]
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => /school-mark"|school-logos"|\/school-logos\b/.test(readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    expect(users).toEqual([
      "components/seeded/schools/seeded-school-detail.tsx",
      "components/seeded/schools/seeded-schools-browser.tsx",
      "components/seeded/ui/school-mark.tsx",
      "lib/school-logos.ts",
    ]);
  });

  it("next.config refuses a direct visit, a frame, a script fetch and another site", async () => {
    const config = (await import("../next.config.mjs?logos=" + Date.now())).default;
    const { beforeFiles } = await config.rewrites();
    const refused = beforeFiles
      .filter((r: { source: string }) => r.source === "/school-logos/:file*")
      .map((r: { has: { key: string; value: string }[] }) => `${r.has[0].key}=${r.has[0].value}`);
    for (const want of ["sec-fetch-dest=document", "sec-fetch-dest=iframe", "sec-fetch-dest=empty", "sec-fetch-site=cross-site"]) {
      expect(refused).toContain(want);
    }
    // An image load from our own page must never be refused.
    expect(refused.some((r: string) => /=image$|=same-origin$/.test(r))).toBe(false);
    const headers = (await config.headers()).find((h: { source: string }) => h.source === "/school-logos/:file*").headers;
    const value = (k: string) => headers.find((h: { key: string }) => h.key === k)?.value;
    expect(value("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(value("X-Robots-Tag")).toMatch(/noimageindex/);
    expect(value("Vary")).toMatch(/Sec-Fetch-Dest/);
  });
});
