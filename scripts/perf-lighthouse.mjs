// D8 perf audit (docs/archive/audit-2-perf.md): Lighthouse mobile — default
// simulated slow-4G + 4x CPU — on a list of routes, N runs each, median
// reported. Signed-out only: a fresh Lighthouse profile holds no session.
//
//   PERF_BASE=https://seededtennis.com node scripts/perf-lighthouse.mjs
//   PERF_BASE=http://localhost:3100 PERF_RUNS=3 node scripts/perf-lighthouse.mjs / /pricing
//
// Prints a markdown table; writes the per-run JSON to $PERF_OUT
// (default ./perf-out, which is not committed).

import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "";
const BASE = process.env.PERF_BASE ?? "http://localhost:3100";
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const OUT = process.env.PERF_OUT ?? "perf-out";
mkdirSync(OUT, { recursive: true });
const CHROME = join(
  HOME,
  "Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
);
const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/", "/pricing", "/onboarding", "/today", "/plan", "/schools", "/events", "/schools/stanford-m"];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const chrome = await chromeLauncher.launch({
  chromePath: CHROME,
  // PERF_INSECURE=1 for a local HTTPS/2 proxy with a self-signed cert (used
  // to give a local build Vercel's HTTP/2 + brotli; see the audit doc).
  chromeFlags: ["--headless=new", "--no-sandbox", ...(process.env.PERF_INSECURE ? ["--ignore-certificate-errors"] : [])],
});
const rows = [];
for (const route of ROUTES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const { lhr } = await lighthouse(BASE + route, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance"],
    });
    const a = lhr.audits;
    const reqs = a["network-requests"]?.details?.items ?? [];
    const fonts = reqs.filter((r) => r.resourceType === "Font");
    const scripts = reqs.filter((r) => r.resourceType === "Script");
    runs.push({
      perf: Math.round((lhr.categories.performance.score ?? 0) * 100),
      ttfb: Math.round(a["server-response-time"]?.numericValue ?? 0),
      fcp: Math.round(a["first-contentful-paint"]?.numericValue ?? 0),
      lcp: Math.round(a["largest-contentful-paint"]?.numericValue ?? 0),
      si: Math.round(a["speed-index"]?.numericValue ?? 0),
      tbt: Math.round(a["total-blocking-time"]?.numericValue ?? 0),
      cls: Math.round((a["cumulative-layout-shift"]?.numericValue ?? 0) * 1000) / 1000,
      fontFiles: fonts.length,
      fontKB: Math.round(fonts.reduce((n, r) => n + (r.transferSize ?? 0), 0) / 1024),
      jsKB: Math.round(scripts.reduce((n, r) => n + (r.transferSize ?? 0), 0) / 1024),
      finalUrl: lhr.finalDisplayedUrl,
      lcpElement:
        a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet?.slice(0, 100) ?? null,
      err: lhr.runtimeError?.code ?? null,
    });
  }
  const pick = (k) => median(runs.map((r) => r[k]));
  rows.push({
    route,
    finalPath: new URL(runs[0].finalUrl).pathname,
    perf: pick("perf"),
    ttfb: pick("ttfb"),
    fcp: pick("fcp"),
    lcp: pick("lcp"),
    si: pick("si"),
    tbt: pick("tbt"),
    cls: pick("cls"),
    fontFiles: pick("fontFiles"),
    fontKB: pick("fontKB"),
    jsKB: pick("jsKB"),
    lcpElement: runs[0].lcpElement,
    err: runs.find((r) => r.err)?.err ?? null,
    runs,
  });
  console.error(`${route} done`);
}
await chrome.kill();
writeFileSync(
  join(OUT, `lighthouse-${new URL(BASE).host.replace(/[:.]/g, "_")}-${Date.now()}.json`),
  JSON.stringify(rows, null, 2)
);
console.log("| Route | Lands on | Perf | TTFB | FCP | LCP | Speed Index | TBT | CLS | Font files (KB) | JS KB |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(
    `| ${r.route} | ${r.finalPath} | ${r.perf} | ${r.ttfb} ms | ${r.fcp} ms | ${r.lcp} ms | ${r.si} ms | ${r.tbt} ms | ${r.cls} | ${r.fontFiles} (${r.fontKB}) | ${r.jsKB} |${r.err ? " ERR " + r.err : ""}`
  );
}
