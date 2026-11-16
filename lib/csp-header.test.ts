import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The production CSP must upgrade insecure requests. SEEDED_LOCAL_HTTP_AUDIT
// exists only so WebKit can audit a production build over plain
// http://localhost (it applies the directive to localhost; Chromium and
// Firefox do not). Nothing that configures a deployment may set it.
const ROOT = join(__dirname, "..");

describe("Content-Security-Policy", () => {
  it("keeps upgrade-insecure-requests in a production build", async () => {
    const prev = { env: process.env.NODE_ENV, audit: process.env.SEEDED_LOCAL_HTTP_AUDIT };
    delete process.env.SEEDED_LOCAL_HTTP_AUDIT;
    const mod = await import("../next.config.mjs?prod=" + Date.now());
    const config = mod.default;
    const all = await config.headers();
    const csp = all
      .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
      .find((h: { key: string }) => h.key.toLowerCase() === "content-security-policy");
    expect(csp?.value).toContain("upgrade-insecure-requests");
    if (prev.audit !== undefined) process.env.SEEDED_LOCAL_HTTP_AUDIT = prev.audit;
  });

  it("no deployment config sets the local audit switch", () => {
    const candidates = ["vercel.json", "vercel.ts", ".env.example", ".env.local.example", "package.json"]
      .concat(readdirSync(join(ROOT, ".github", "workflows")).map((f) => join(".github", "workflows", f)));
    for (const f of candidates) {
      let src = "";
      try {
        src = readFileSync(join(ROOT, f), "utf8");
      } catch {
        continue;
      }
      expect(src, f).not.toMatch(/SEEDED_LOCAL_HTTP_AUDIT/);
    }
  });
});
