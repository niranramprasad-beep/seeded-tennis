// Which elements shift on a page, and by how much, for a signed-in persona.
//
//   node scripts/cls-sources.mjs fake-persona-a@example.com /schools 375
//
// Signs in through the real /login form (password from
// ~/seeded-evidence/overnight/.persona-pass, never printed), waits for the
// remembered role to be stored, then loads the route and prints every
// layout-shift entry with its source elements' before/after x, y, width and
// height. site-audit.mjs gives the CLS number; this tells you what moved.
// Found every /schools shift fixed in PR A (fix/ui-polish-1).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const HOME = process.env.HOME;
const PASSWORD = readFileSync(join(HOME, "seeded-evidence/overnight/.persona-pass"), "utf8").trim();
const CHROME = join(HOME, "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const [email, route, width] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 375)];
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width, height: 812 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3100/login");
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', PASSWORD);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }), page.click('button[type="submit"]')]);
await page.waitForTimeout(2500);
await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({ value: +e.value.toFixed(4), t: Math.round(e.startTime), sources: (e.sources || []).map((s) => {
        const n = s.node; const d = n && n.nodeType === 1 ? n : n?.parentElement;
        return `${d ? d.tagName.toLowerCase() + "." + String(d.className).split(" ").slice(0, 4).join(".") : "?"} "${(d?.textContent || "").trim().slice(0, 40)}" x${Math.round(s.previousRect.x)}->${Math.round(s.currentRect.x)} y${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} w${Math.round(s.previousRect.width)}->${Math.round(s.currentRect.width)} h${Math.round(s.currentRect.height)}`;
      }) });
    }
  }).observe({ type: "layout-shift", buffered: true });
});
await page.goto("http://localhost:3100" + route, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const shifts = await page.evaluate(() => window.__shifts);
console.log(JSON.stringify({ total: +shifts.reduce((a, s) => a + s.value, 0).toFixed(4), shifts }, null, 1));
await browser.close();
