// Keyboard pass: Tab through a page and record, for every stop, whether a
// focus indicator is actually visible (outline or ring), whether the
// element is on screen and not under a sticky/fixed header, and the order.
//   node scripts/keyboard-audit.mjs [persona] /route /route ...
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const HOME = process.env.HOME ?? "";
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3100";
const OUT = join(HOME, "seeded-evidence/overnight/keyboard");
mkdirSync(OUT, { recursive: true });
const CHROME = join(HOME, "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const [who, ...routes] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
if (who && who !== "h") {
  const pass = readFileSync(join(HOME, "seeded-evidence/overnight/.persona-pass"), "utf8").trim();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[type="email"]', `fake-persona-${who}@example.com`);
  await p.fill('input[type="password"]', pass);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click('button[type="submit"]')]);
  await p.close();
}
const report = {};
for (const theme of ["light", "dark"]) {
  for (const r of routes) {
    const p = await ctx.newPage();
    await p.addInitScript(`try{localStorage.setItem("seeded.design","seeded");localStorage.setItem("seeded.mode","${theme}");localStorage.setItem("seeded.mode.system","0")}catch(e){}`);
    await p.goto(BASE + r, { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    const stops = [];
    for (let i = 0; i < 45; i++) {
      await p.keyboard.press("Tab");
      await p.waitForTimeout(260); // html is scroll-behavior: smooth — let focus scrolling settle (harness bug #6)
      const s = await p.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
        const ring = cs.boxShadow && cs.boxShadow !== "none";
        const ul = cs.textDecorationLine.includes("underline");
        // Anything fixed/sticky at the top that overlaps the element?
        let obscured = false;
        for (const h of document.querySelectorAll("header, [class*='sticky'], [class*='fixed']")) {
          const hcs = getComputedStyle(h);
          if (!/sticky|fixed/.test(hcs.position) || h.contains(el)) continue;
          const hr = h.getBoundingClientRect();
          if (hr.height > 0 && hr.height < window.innerHeight / 2 && r.top < hr.bottom && r.bottom > hr.top && r.left < hr.right && r.right > hr.left) obscured = true;
        }
        return {
          tag: el.tagName.toLowerCase(),
          name: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
          visibleIndicator: outline || ring,
          underlineOnly: !outline && !ring && ul,
          onScreen: r.bottom > 0 && r.top < window.innerHeight && r.width > 0,
          obscured,
        };
      });
      if (s) stops.push(s);
    }
    const bad = stops.filter((s) => !s.visibleIndicator || !s.onScreen || s.obscured);
    report[`${theme} ${r}`] = { first: stops[0]?.name, stops: stops.length, problems: bad.slice(0, 10) };
    console.log(`${theme} ${r}: first="${stops[0]?.name}" stops=${stops.length} problems=${bad.length}`);
    for (const x of bad.slice(0, 6)) console.log("    ", JSON.stringify(x));
    await p.close();
  }
}
writeFileSync(join(OUT, `${who || "h"}.json`), JSON.stringify(report, null, 2));
await b.close();
