// Lighthouse (mobile form factor, default throttling) on every public route,
// against a production build. Run it with nothing else hitting the server —
// a concurrent crawl skews the performance numbers.
//
//   node scripts/lighthouse-run.mjs            # all public routes
//   node scripts/lighthouse-run.mjs / /pricing # just those
//
// Writes ~/seeded-evidence/overnight/lighthouse/summary.json and prints a
// table. Signed-in routes are not run: their session lives in localStorage,
// which a fresh Lighthouse profile does not have; axe covers their a11y.

import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "";
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3100";
const OUT = process.env.LH_OUT ?? join(HOME, "seeded-evidence/overnight/lighthouse");
mkdirSync(OUT, { recursive: true });
const CHROME = join(HOME, "Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/", "/onboarding", "/pricing", "/schools", "/schools/stanford-m", "/schools/tcu-w", "/tournament-fit", "/how-it-works", "/parents", "/methodology", "/sample-report", "/contact", "/privacy", "/terms", "/login", "/signup"];

const chrome = await chromeLauncher.launch({ chromePath: CHROME, chromeFlags: ["--headless=new", "--no-sandbox"] });
const rows = [];
for (const route of ROUTES) {
  const result = await lighthouse(BASE + route, {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  });
  const lhr = result.lhr;
  const a = lhr.audits;
  const row = {
    route,
    perf: Math.round((lhr.categories.performance.score ?? 0) * 100),
    a11y: Math.round((lhr.categories.accessibility.score ?? 0) * 100),
    bp: Math.round((lhr.categories["best-practices"].score ?? 0) * 100),
    seo: Math.round((lhr.categories.seo.score ?? 0) * 100),
    lcpMs: Math.round(a["largest-contentful-paint"]?.numericValue ?? 0),
    cls: Math.round((a["cumulative-layout-shift"]?.numericValue ?? 0) * 1000) / 1000,
    tbtMs: Math.round(a["total-blocking-time"]?.numericValue ?? 0),
    runtimeError: lhr.runtimeError?.code ?? null,
    failing: Object.values(a)
      .filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode === "binary")
      .map((x) => x.id)
      .slice(0, 8),
  };
  rows.push(row);
  console.log(
    `${route.padEnd(22)} perf ${String(row.perf).padStart(3)}  a11y ${String(row.a11y).padStart(3)}  bp ${String(row.bp).padStart(3)}  seo ${String(row.seo).padStart(3)}  LCP ${row.lcpMs}ms  CLS ${row.cls}  TBT ${row.tbtMs}ms${row.runtimeError ? "  ERR " + row.runtimeError : ""}${row.failing.length ? "  fails: " + row.failing.join(",") : ""}`
  );
}
await chrome.kill();
writeFileSync(join(OUT, "summary.json"), JSON.stringify(rows, null, 2));
