// D8 perf audit (docs/archive/audit-2-perf.md): how long a SIGNED-IN user waits
// for real content on the app routes, desktop, no throttling (broadband).
// Run against a production build whose .env.local points at STAGING:
//
//   npx next build && npx next start -p 3100       (another terminal)
//   PERF_EMAIL=fake-…@example.com PERF_PASS_FILE=/path/600-mode-file \
//     node scripts/perf-signed-in.mjs
//
// The password is read from a file and never printed. "Content visible" =
// the first animation frame at which <main> has a visible <h1>, no visible
// skeleton (.animate-pulse), nothing aria-busy, and no AuthGate spinner —
// and that stays true for 300 ms (so a skeleton that comes back after the
// session check does not count as done).
//
// Also counts the Supabase calls each load makes before content shows, which
// is how the getUser waterfall was found.

import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "";
const BASE = process.env.PERF_BASE ?? "http://localhost:3100";
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const EMAIL = process.env.PERF_EMAIL;
const PASSWORD = readFileSync(process.env.PERF_PASS_FILE, "utf8").trim();
const SLUG = process.env.PERF_SLUG ?? "stanford-m";
// Extra round-trip latency added to EVERY request (CDP network emulation),
// on top of whatever the real link has. 0 = the raw local link. Supabase
// from the measuring machine was ~16 ms away; a real family on home wifi far
// from the project's region is more like 80–150 ms, which is where a serial
// chain of auth calls turns into seconds. Throughput stays broadband.
const LATENCY = Number(process.env.PERF_LATENCY ?? 0);
const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/today", "/plan", "/schools", "/events", `/schools/${SLUG}`];
const CHROME = join(
  HOME,
  "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const browser = await chromium.launch({ executablePath: CHROME });

const login = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const lp = await login.newPage();
await lp.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await lp.fill('input[type="email"]', EMAIL);
await lp.fill('input[type="password"]', PASSWORD);
await Promise.all([
  lp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }),
  lp.click('button[type="submit"]'),
]);
await lp.waitForTimeout(1500);
const STATE = await login.storageState();
await login.close();

const READY = `(() => {
  const main = document.querySelector("main");
  if (!main) return false;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const h1 = [...main.querySelectorAll("h1")].some(vis);
  if (!h1) return false;
  if ([...main.querySelectorAll(".animate-pulse")].some(vis)) return false;
  if (main.querySelector('[aria-busy="true"]')) return false;
  if ([...main.querySelectorAll(".border-t-grass.rounded-full")].some(vis)) return false;
  return true;
})()`;

const rows = [];
for (const route of ROUTES) {
  const times = [];
  const calls = [];
  const skeletonSeen = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
    const page = await ctx.newPage();
    if (LATENCY > 0) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: LATENCY,
        downloadThroughput: (40 * 1024 * 1024) / 8,
        uploadThroughput: (10 * 1024 * 1024) / 8,
      });
    }
    const supa = [];
    page.on("request", (r) => {
      const u = r.url();
      if (/supabase\.co\/(auth|rest)\//.test(u)) supa.push({ u: u.replace(/\?.*/, "").replace(/^https:\/\/[^/]+/, ""), t: Date.now() });
    });
    // Poll on every frame in the page, recording the first time READY held
    // and whether a skeleton/spinner was ever on screen.
    await page.addInitScript(`(() => {
      window.__perf = { readyAt: null, sawSkeleton: false };
      const tick = () => {
        let ok = false;
        try { ok = ${READY}; } catch {}
        const main = document.querySelector("main");
        if (main && (main.querySelector(".animate-pulse,[aria-busy='true'],.border-t-grass.rounded-full"))) window.__perf.sawSkeleton = true;
        if (ok) { if (window.__perf.readyAt === null) window.__perf.readyAt = performance.now(); }
        else window.__perf.readyAt = null;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: "commit" });
    let readyAt = null;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const p = await page.evaluate(() => ({ r: window.__perf?.readyAt, now: performance.now() })).catch(() => null);
      if (p && p.r !== null && p.r !== undefined && p.now - p.r >= 300) {
        readyAt = p.r;
        break;
      }
      await page.waitForTimeout(50);
    }
    const final = new URL(page.url()).pathname;
    const saw = await page.evaluate(() => window.__perf.sawSkeleton).catch(() => null);
    const before = readyAt === null ? supa : supa.filter((c) => c.t - t0 <= readyAt + 50);
    times.push(readyAt === null ? NaN : Math.round(readyAt));
    calls.push({
      final,
      user: before.filter((c) => c.u.includes("/auth/v1/user")).length,
      rest: before.filter((c) => c.u.includes("/rest/v1/")).length,
      paths: before.map((c) => c.u),
    });
    skeletonSeen.push(saw);
    await ctx.close();
  }
  const ok = times.filter((t) => !Number.isNaN(t));
  rows.push({
    route,
    final: calls[0].final,
    medianMs: ok.length ? median(ok) : null,
    minMs: ok.length ? Math.min(...ok) : null,
    maxMs: ok.length ? Math.max(...ok) : null,
    timeouts: times.length - ok.length,
    getUserCalls: median(calls.map((c) => c.user)),
    restCalls: median(calls.map((c) => c.rest)),
    sample: calls[calls.length - 1].paths,
  });
  console.error(`${route}: ${times.join(", ")} ms`);
}
await browser.close();

console.log(JSON.stringify(rows.map(({ sample, ...r }) => r)));
console.log(`\nAdded latency: ${LATENCY} ms per request\n`);
console.log("| Route | Lands on | Content visible (median of " + RUNS + ") | min–max | /auth/v1/user calls before content | REST calls before content |");
console.log("|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(`| ${r.route} | ${r.final} | ${r.medianMs ?? "timeout"} ms | ${r.minMs}–${r.maxMs} ms${r.timeouts ? ` (${r.timeouts} timeouts)` : ""} | ${r.getUserCalls} | ${r.restCalls} |`);
}
console.log("\nSample request order, last run of each route:");
for (const r of rows) console.log(r.route + ": " + r.sample.join(" → "));
