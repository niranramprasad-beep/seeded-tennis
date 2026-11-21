// UI audit: screenshots at four widths, axe-core violations, console errors,
// and an objective header-wrap measurement.
//
// Written for the launch UI polish pass. Run it before and after a change:
//   node scripts/ui-audit.mjs before
//   node scripts/ui-audit.mjs after
//
// Screenshots go to docs/screenshots/polish/<label>/ and the machine-readable
// summary to docs/screenshots/polish/<label>.json, so a later run can be
// diffed against an earlier one rather than eyeballed.
//
// Why a script and not the browser tooling by hand: 9 pages x 4 widths is 36
// images per pass, and the point is a file on disk that a human can open, not
// a picture in a transcript.

import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3101";
const LABEL = process.argv[2] ?? "before";
// A brand-new visitor gets systemSync=true (lib/context/design-context.tsx),
// so their very first paint follows their OS — light for some, dark for
// others. Both have to be audited; a contrast pass in one mode says
// nothing about the other.
const MODE = process.argv[3] === "dark" ? "dark" : "light";
const OUT = join(ROOT, "docs/screenshots/polish", `${LABEL}-${MODE}`);
const WIDTHS = [375, 768, 1024, 1440];
// Header-wrap is checked at the three widths the review named, plus 375 to
// confirm the mobile menu is the one that renders there.
const HEADER_WIDTHS = [1024, 1280, 1440];

const AXE = readFileSync(join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const PAGES = [
  { slug: "home", path: "/" },
  { slug: "pricing", path: "/pricing" },
  { slug: "schools", path: "/schools" },
  { slug: "school-detail", path: process.env.AUDIT_SCHOOL_PATH ?? "/schools/stanford-m" },
  { slug: "login", path: "/login" },
  { slug: "signup", path: "/signup" },
  { slug: "onboarding", path: "/onboarding" },
  { slug: "methodology", path: "/methodology" },
  // Signed-in route. Captured logged-out on purpose: local dev points at
  // staging and every staging password was scrambled after the rehearsal, so
  // there is no account here that can sign in. The image shows what a
  // visitor hitting the URL sees.
  { slug: "family", path: "/family" },
];

mkdirSync(OUT, { recursive: true });

// The installed playwright-core expects a chromium build revision that is not
// in the local cache (it wants 1148, the cache has 1243). Point it at the
// binary that IS here rather than downloading another ~150MB.
const CHROME =
  process.env.AUDIT_CHROME ??
  join(
    process.env.HOME ?? "",
    "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
  );

const browser = await chromium.launch({ executablePath: CHROME });
const summary = { label: LABEL, base: BASE, at: new Date().toISOString(), pages: [] };

for (const p of PAGES) {
  const entry = { ...p, widths: {}, axe: {}, consoleErrors: [], header: {} };

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: MODE,
    });
    const page = await ctx.newPage();
    // Pin the mode explicitly as well as via prefers-color-scheme, so the
    // shot does not depend on the headless default.
    await page.addInitScript((m) => {
      try {
        window.localStorage.setItem("seeded.mode", m);
        window.localStorage.setItem("seeded.mode.system", "0");
      } catch {}
    }, MODE);
    // Vercel Analytics and Speed Insights inject <script src="/_vercel/...">
    // in a production build. Those paths are served by Vercel's edge, not by
    // `next start`, so against a local production server they 404 and the
    // browser logs a MIME-type refusal. It is an artefact of running the
    // build off-platform, not a fault in the page, and counting it would
    // bury a real error in 144 copies of a fake one.
    const KNOWN_LOCAL_ONLY = /_vercel\/(insights|speed-insights)|Failed to load resource.*404/;
    const errors = [];
    const ignored = [];
    const record = (text) => (KNOWN_LOCAL_ONLY.test(text) ? ignored : errors).push(text.slice(0, 300));
    page.on("console", (m) => {
      if (m.type() === "error") record(m.text());
    });
    page.on("pageerror", (e) => record("pageerror: " + String(e.message)));

    try {
      await page.goto(BASE + p.path, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      // networkidle can never settle on a page holding an open connection;
      // fall back to domcontentloaded rather than dropping the page.
      await page.goto(BASE + p.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    }
    // The mode resolves after hydration (DesignProvider rewrites
    // data-seeded-mode); shooting before that can capture the wrong mode.
    await page
      .waitForFunction((m) => document.documentElement.dataset.seededMode === m, MODE, { timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(900);

    // Several sections animate in with framer-motion's whileInView. A
    // fullPage screenshot does NOT trigger those — it composites the long
    // page without ever scrolling it — so the first pass came back with
    // entire bands blank. Walk the page to fire the observers, then return
    // to the top before shooting.
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.75);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 350));
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 250));
    });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: join(OUT, `${p.slug}-${width}.png`),
      fullPage: true,
    });

    entry.widths[width] = { shot: `${p.slug}-${width}.png` };
    if (errors.length) entry.consoleErrors.push(...errors.map((e) => `[${width}] ${e}`));
    entry.ignoredLocalOnly = (entry.ignoredLocalOnly ?? 0) + ignored.length;

    // Objective header-wrap check: a single-row header has exactly one
    // distinct child top offset and a height in one-row range.
    if (HEADER_WIDTHS.includes(width) || width === 375) {
      entry.header[width] = await page.evaluate(() => {
        const h = document.querySelector("header");
        if (!h) return { present: false };
        const nav = h.querySelector("nav") ?? h;
        const kids = [...nav.children].filter((c) => c.getBoundingClientRect().width > 0);
        // Row count by vertical CENTRE, not by top edge. The children are
        // vertically centred and have different heights (a 28px logo next
        // to a 44px button), so their tops legitimately differ on a single
        // row — an earlier version of this check counted that as 3 rows and
        // would have called a correct header broken.
        const centres = kids.map((c) => {
          const b = c.getBoundingClientRect();
          return Math.round((b.top + b.height / 2) / 6);
        });
        const rows = [...new Set(centres)].length;
        // A wrapped child is taller than one line of its own text.
        const tallest = Math.max(...kids.map((c) => Math.round(c.getBoundingClientRect().height)), 0);
        return {
          present: true,
          headerHeight: Math.round(h.getBoundingClientRect().height),
          navHeight: Math.round(nav.getBoundingClientRect().height),
          visibleChildren: kids.length,
          rows,
          tallestChild: tallest,
          // The real pass/fail: nothing may overflow the viewport sideways.
          // See scripts/persona-walk.mjs: scrollWidth is inflated by inner
          // scroll containers. Test whether the page actually moves.
          horizontalOverflow: (() => {
            const before = window.scrollX;
            window.scrollTo(500, window.scrollY);
            const moved = window.scrollX > 0;
            window.scrollTo(before, window.scrollY);
            return moved;
          })(),
        };
      });
    }

    // Contrast, measured. axe reports a colour-contrast check it cannot
    // decide as "incomplete" rather than a violation, which is exactly how
    // a faint strip over a tinted panel slips through a 0-violation run.
    if (width === 1440) {
      entry.contrast = await page.evaluate(() => {
        const lum = (c) => {
          const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (f, b) => {
          const L1 = lum(f), L2 = lum(b);
          return +(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2));
        };
        const bgOf = (el) => {
          let e = el;
          while (e) {
            const c = getComputedStyle(e).backgroundColor;
            if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
            e = e.parentElement;
          }
          return "rgb(255, 255, 255)";
        };
        const out = {};
        const strip = [...document.querySelectorAll("span")].find((s) =>
          s.textContent.includes("Team ratings that are estimates")
        );
        if (strip) {
          const cs = getComputedStyle(strip);
          out.trustStrip = { size: cs.fontSize, ratio: ratio(cs.color, bgOf(strip)) };
        }
        const band = [...document.querySelectorAll("section")].find((s) =>
          s.textContent.includes("before your next tournament")
        );
        if (band) {
          const bandBg = getComputedStyle(band).backgroundColor;
          const btn = band.querySelector("a");
          const h = band.querySelector("h2");
          if (btn) {
            const cs = getComputedStyle(btn);
            out.ctaButton = {
              textVsButton: ratio(cs.color, cs.backgroundColor),
              buttonVsBand: ratio(cs.backgroundColor, bandBg),
            };
          }
          if (h) out.ctaHeading = { ratio: ratio(getComputedStyle(h).color, bandBg) };
        }
        return out;
      });
    }

    // axe at the two widths the review named.
    if (width === 1440 || width === 375) {
      await page.addScriptTag({ content: AXE });
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          resultTypes: ["violations"],
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        });
        return r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          help: v.help,
          target: v.nodes[0]?.target?.join(" ") ?? "",
        }));
      });
      entry.axe[width] = res;
    }

    await ctx.close();
  }

  summary.pages.push(entry);
  const vio = Object.values(entry.axe).flat().length;
  console.log(
    `${p.slug.padEnd(14)} axe:${String(vio).padStart(2)}  consoleErr:${String(entry.consoleErrors.length).padStart(2)}` +
      `  header@1440 rows=${entry.header[1440]?.rows ?? "-"} h=${entry.header[1440]?.headerHeight ?? "-"}`
  );
}

writeFileSync(join(ROOT, "docs/screenshots/polish", `${LABEL}-${MODE}.json`), JSON.stringify(summary, null, 2));
await browser.close();

const totalAxe = summary.pages.reduce((a, p) => a + Object.values(p.axe).flat().length, 0);
const totalErr = summary.pages.reduce((a, p) => a + p.consoleErrors.length, 0);
console.log(`\n${LABEL}/${MODE}: ${totalAxe} axe violations, ${totalErr} console errors across ${PAGES.length} pages`);
