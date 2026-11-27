import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Bug hunt 2026-11-26, BUG-013: /favicon.ico answered 404. The icon is
// generated at /icon (app/icon.tsx) and linked from every page's <head>, but
// browsers, bookmark tools and feed readers also ask for /favicon.ico
// directly. It is answered with the same generated icon, so the two cannot
// drift apart and there is no second file to keep.

const ROOT = join(__dirname, "..");

describe("/favicon.ico", () => {
  it("is rewritten to the generated icon", async () => {
    const config = (await import("../next.config.mjs?favicon=" + Date.now())).default;
    const rewrites = await config.rewrites();
    expect(rewrites.afterFiles).toContainEqual({ source: "/favicon.ico", destination: "/icon" });
  });

  it("points at an icon that exists, and no static favicon.ico shadows it", () => {
    expect(existsSync(join(ROOT, "app", "icon.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "app", "favicon.ico"))).toBe(false);
    expect(existsSync(join(ROOT, "public", "favicon.ico"))).toBe(false);
  });

  it("leaves the school-logo refusals ahead of everything else", async () => {
    const config = (await import("../next.config.mjs?favicon-order=" + Date.now())).default;
    const rewrites = await config.rewrites();
    expect(rewrites.beforeFiles.length).toBeGreaterThan(0);
    expect(rewrites.beforeFiles.every((r: { source: string }) => r.source === "/school-logos/:file*")).toBe(true);
  });
});
