// Every route, as every relevant persona, on a PRODUCTION build.
//
//   npm run build && npm run start -- -p 3100        (in another terminal)
//   node scripts/site-audit.mjs tier1                 # chromium, all routes x personas, 375+1440, light+dark
//   node scripts/site-audit.mjs widths                # public routes, 7 widths, signed out
//   node scripts/site-audit.mjs browsers              # webkit + firefox, key routes
//   node scripts/site-audit.mjs extras                # legacy theme, OS-sync, 200% zoom, reduced motion
//   node scripts/site-audit.mjs tier1 a f             # only those personas
//
// Routes are ENUMERATED from app/**/page.tsx, not hand-picked, so a new page
// is audited the day it exists. Dynamic segments get real catalogue slugs.
//
// What it records per route x persona x viewport x theme x browser, to
// ~/seeded-evidence/overnight/audit/<pass>/ (never the repo):
//   - final URL (did a guard redirect?), HTTP status, <title>, h1 count,
//     meta description, canonical
//   - console errors, page errors, failed same-origin requests (Vercel's
//     /_vercel/* scripts excepted BY URL — they only exist on Vercel's edge)
//   - axe-core violations, WCAG 2.0/2.1/2.2 A + AA
//   - can the page ACTUALLY scroll sideways (it tries; scrollWidth lies —
//     see FINAL_PASS_REPORT "a fourth harness bug")
//   - rendered junk: undefined / null / NaN / Invalid Date / [object Object]
//     / a 0.0 UTR
//   - interactive elements smaller than 24px (WCAG 2.5.8), excluding links
//     inside running text and sr-only controls, and text under 14px on
//     anything a user acts on
//   - images without alt, links to localhost/staging/google search, external
//     target=_blank without rel=noopener, mailto: to anything but support@
//   - CLS and LCP from PerformanceObserver
//   - a full-page screenshot, taken AFTER scrolling to the bottom (whileInView
//     animations) and back
//
// Sign-in is through the real /login form against STAGING, with the
// disposable persona password in ~/seeded-evidence/overnight/.persona-pass.
// The script never prints it.

import { chromium, firefox, webkit } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.HOME ?? "";
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3100";
const EVIDENCE = join(HOME, "seeded-evidence/overnight");
const PASS = process.argv[2] ?? "tier1";
const ONLY = new Set(process.argv.slice(3));
// AUDIT_OUT (absolute) overrides where a pass writes, e.g.
// ~/seeded-evidence/ui-polish-1/before — so before/after runs sit side by side.
const OUT = process.env.AUDIT_OUT ?? join(EVIDENCE, "audit", PASS);
mkdirSync(join(OUT, "shots"), { recursive: true });
const RESULTS = join(OUT, "results.jsonl");
writeFileSync(RESULTS, "");

const AXE = readFileSync(join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
const PASSWORD = existsSync(join(EVIDENCE, ".persona-pass"))
  ? readFileSync(join(EVIDENCE, ".persona-pass"), "utf8").trim()
  : null;

const CHROME = join(
  HOME,
  "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
);

/* ---------------------------------------------------------------- routes */

function pageFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pageFiles(p, acc);
    else if (name === "page.tsx") acc.push(p);
  }
  return acc;
}

// Harness bug found on its first run, recorded so it is not repeated: the
// data files hold RAW slugs ("stanford") and lib/db/schools-data-mens.ts
// appends "-m" at load, so every sampled URL 404'd and looked like a broken
// site. Slugs now come from what the build actually prerendered.
function catalogueSlugs() {
  const out = [];
  const built = join(ROOT, ".next/server/app/schools");
  const real = new Set(readdirSync(built).filter((n) => n.endsWith(".html")).map((n) => n.slice(0, -5)));
  for (const f of ["schools-data-mens.ts", "schools-data-womens.ts", "schools-data-extra.ts"]) {
    const src = readFileSync(join(ROOT, "lib/db", f), "utf8");
    for (const m of src.matchAll(/slug:\s*"([^"]+)"[\s\S]*?division:\s*"(D\d)"/g)) {
      const slug = [m[1], `${m[1]}-m`].find((x) => real.has(x));
      if (slug) out.push({ slug, division: m[2] });
    }
  }
  return out;
}

const SLUGS = catalogueSlugs();
function sampleSchoolSlugs() {
  // >= 10, across D1/D2/D3, men's and women's.
  const pick = [];
  const by = (pred, n) => SLUGS.filter(pred).slice(0, n).forEach((s) => pick.push(s.slug));
  by((s) => s.division === "D1" && s.slug.endsWith("-m"), 3);
  by((s) => s.division === "D1" && s.slug.endsWith("-w"), 3);
  by((s) => s.division === "D2", 2);
  by((s) => s.division === "D3", 2);
  pick.push("virginia-tech-m", "tulane-m", "penn-m"); // persona (a)'s targets
  return [...new Set(pick)];
}

export const ALL_ROUTES = (() => {
  const routes = [];
  for (const f of pageFiles(join(ROOT, "app"))) {
    const rel = relative(join(ROOT, "app"), dirname(f)).split("/").filter((s) => !/^\(.*\)$/.test(s));
    const path = "/" + rel.join("/");
    if (path.includes("[slug]")) {
      for (const slug of sampleSchoolSlugs()) routes.push(path.replace("[slug]", slug));
    } else routes.push(path === "/" ? "/" : path.replace(/\/$/, ""));
  }
  routes.push("/schools/not-a-real-school", "/this-page-does-not-exist", "/robots.txt", "/sitemap.xml");
  return [...new Set(routes)].sort();
})();

const APP_ROUTES = ALL_ROUTES.filter((r) =>
  /^\/(today|plan|outreach|events|family|settings|training|matches|match-mode|dashboard|roadmap|coaches|cost-calculator|onboarding|tournament-fit)(\/|$)/.test(r)
);
const KEY_PUBLIC = ["/", "/schools", "/schools/stanford-m", "/schools/stanford-w", "/pricing", "/methodology", "/tournament-fit"];

/* -------------------------------------------------------------- personas */

const P = (id, email, label, routes) => ({ id, email, label, routes });
export const PERSONAS = [
  P("h", null, "Logged-out first-time visitor", ALL_ROUTES),
  P("a", "fake-persona-a@example.com", "Men's 8.7, C/2031, GPA 3.5, Free", [...APP_ROUTES, ...KEY_PUBLIC]),
  P("b", "fake-persona-b@example.com", "Women's 6.0, C/2029, GPA 3.9", [...APP_ROUTES, ...KEY_PUBLIC]),
  P("c", "fake-persona-c@example.com", "Men's 11.0, C/2027, Player tier", [...APP_ROUTES, ...KEY_PUBLIC]),
  P("d", "fake-persona-d@example.com", "Women's 9.4, C/2026, senior", [...APP_ROUTES, ...KEY_PUBLIC]),
  P("e", "fake-persona-e@example.com", "Men's 4.0, C/2030, no GPA", [...APP_ROUTES, ...KEY_PUBLIC]),
  P("f", "fake-persona-f@example.com", "Parent of (a), account holder, Family tier", [...APP_ROUTES, ...KEY_PUBLIC]),
  P("g", "fake-persona-g@example.com", "Under-13, consent pending", [...APP_ROUTES, "/", "/schools"]),
  P("j", "fake-persona-j@example.com", "Brand-new signup, no data", [...APP_ROUTES, "/", "/schools"]),
];

/* ---------------------------------------------------------------- passes */

const W = (width, height) => ({ width, height });
const PASSES = {
  tier1: {
    browsers: ["chromium"],
    viewports: [W(375, 812), W(1440, 900)],
    themes: ["light", "dark"],
    axe: true,
    shots: true,
  },
  widths: {
    browsers: ["chromium"],
    personas: ["h"],
    routes: ALL_ROUTES.filter((r) => !APP_ROUTES.includes(r) || r === "/onboarding" || r === "/tournament-fit"),
    viewports: [W(375, 812), W(390, 844), W(768, 1024), W(1024, 768), W(1280, 800), W(1440, 900), W(1920, 1080)],
    themes: ["light"],
    axe: false,
    shots: true,
  },
  browsers: {
    browsers: ["webkit", "firefox"],
    personas: ["h", "a", "f"],
    routes: ["/", "/onboarding", "/schools", "/schools/stanford-m", "/pricing", "/login", "/signup", "/today", "/plan", "/events", "/outreach", "/family", "/family/budget", "/settings"],
    viewports: [W(375, 812), W(1440, 900)],
    themes: ["light", "dark"],
    axe: false,
    shots: true,
  },
  // Every route, every persona, at phone widths only: catches content
  // clipped past the right edge (the `clipped` field).
  narrow: {
    browsers: ["chromium"],
    viewports: [W(320, 700), W(375, 812)],
    themes: ["light"],
    axe: false,
    shots: true,
  },
  // Before/after evidence for a UI change: signed-out + a player + a parent,
  // at the three widths the polish brief names, light and dark.
  polish: {
    browsers: ["chromium"],
    personas: (process.env.AUDIT_PERSONAS ?? "h,a,f").split(","),
    viewports: [W(320, 700), W(375, 812), W(1440, 900)],
    themes: ["light", "dark"],
    axe: true,
    shots: true,
  },
  extras: {
    browsers: ["chromium"],
    personas: ["h", "a", "f"],
    routes: ["/", "/onboarding", "/schools", "/schools/stanford-m", "/pricing", "/today", "/plan", "/family", "/settings"],
    viewports: [W(1440, 900)],
    themes: ["legacy", "system-dark", "zoom200", "reduced-motion"],
    axe: true,
    shots: true,
  },
};
const cfg = PASSES[PASS];
if (process.env.AUDIT_BROWSERS) cfg.browsers = process.env.AUDIT_BROWSERS.split(",");
if (!cfg) throw new Error(`unknown pass ${PASS}`);

/* --------------------------------------------------------------- helpers */

const LAUNCH = {
  chromium: () => chromium.launch({ executablePath: CHROME }),
  webkit: () => webkit.launch(),
  // Firefox lives in its own browsers path: installing it into the shared
  // one kept evicting WebKit (see scripts/README.md).
  firefox: () =>
    firefox.launch({
      executablePath: join(HOME, "Library/Caches/ms-playwright-ff/firefox-1466/firefox/Nightly.app/Contents/MacOS/firefox"),
    }),
};

function themeInit(theme) {
  // Sets the design keys only. Never clears storage — that would sign the
  // persona out (harness bug #3 from earlier passes).
  const design = theme === "legacy" ? "legacy" : "seeded";
  const mode = theme === "dark" ? "dark" : "light";
  const sync = theme === "system-dark" ? "1" : "0";
  return `try{localStorage.setItem("seeded.design","${design}");localStorage.setItem("seeded.mode","${mode}");localStorage.setItem("seeded.mode.system","${sync}");}catch(e){}`;
}

const PERF_INIT = `(() => {
  window.__cls = 0; window.__lcp = 0;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { const es = l.getEntries(); const last = es[es.length - 1]; if (last) window.__lcp = last.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {}
})();`;

async function signIn(browser, persona, viewport) {
  const ctx = await browser.newContext({ viewport });
  if (!persona.email) return ctx;
  if (!PASSWORD) throw new Error("no persona password file");
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill('input[type="email"]', persona.email);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(800);
  await page.close();
  return ctx;
}

async function measure(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const srOnly = (el) => {
      const r = el.getBoundingClientRect();
      return r.width <= 2 && r.height <= 2;
    };
    const inRunningText = (el) => {
      if (el.tagName !== "A") return false;
      const p = el.parentElement;
      if (!p) return false;
      const own = [...p.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      return own.length > 0 && /^(P|LI|SPAN|DD|TD|LABEL|SMALL)$/.test(p.tagName);
    };
    const text = document.body?.innerText ?? "";
    const junk = [];
    for (const [name, re] of [
      ["undefined", /\bundefined\b/],
      ["null", /\bnull\b/],
      ["NaN", /\bNaN\b/],
      ["Invalid Date", /Invalid Date/],
      ["[object Object]", /\[object Object\]/],
      ["0.0 UTR", /\b0\.0{1,2}\s*UTR\b|\bUTR\s*0\.0{1,2}\b/],
    ]) {
      const m = text.match(re);
      if (m) junk.push(`${name}: …${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}…`);
    }
    const interactive = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],summary")].filter(vis);
    const smallTargets = [];
    const smallText = [];
    for (const el of interactive) {
      if (srOnly(el) || inRunningText(el)) continue;
      // A range input's target is its thumb (44px in globals.css), not the
      // 6px track this would otherwise measure.
      if (el.tagName === "INPUT" && el.getAttribute("type") === "range") continue;
      const r = el.getBoundingClientRect();
      // a control inside a label/target that is itself big enough is fine
      const host = el.closest("label") ?? el;
      const hr = host.getBoundingClientRect();
      // pseudo-element hit areas (range bar ::after) — trust an explicit marker
      const pad = el.getAttribute("data-hit-area");
      // The LARGER of the control and its <label> is the target: a 20px
      // checkbox inside a 44px label is a 44px target. (Harness bug #5: this
      // took the smaller, and reported the /schools compare boxes as 20px.)
      if ((Math.max(r.width, hr.width) < 24 || Math.max(r.height, hr.height) < 24) && !pad) {
        smallTargets.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const label = (el.textContent || "").trim();
      if (label && fs < 14) smallText.push(`${el.tagName.toLowerCase()} "${label.slice(0, 30)}" ${fs}px`);
    }
    const links = [...document.querySelectorAll("a[href]")].map((a) => ({
      href: a.getAttribute("href"),
      target: a.getAttribute("target"),
      rel: a.getAttribute("rel") ?? "",
      text: (a.textContent || "").trim().slice(0, 40),
    }));
    const badLinks = links.filter((l) =>
      /localhost|127\.0\.0\.1|vercel\.app|supabase\.co|google\.com\/search|\/dev\//.test(l.href ?? "") ||
      (l.href?.startsWith("mailto:") && !/^mailto:support@seededtennis\.com/i.test(l.href)) ||
      (l.target === "_blank" && !/noopener|noreferrer/.test(l.rel))
    );
    const imgsNoAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).map((i) => i.src.slice(-60));
    // Actually try to scroll sideways.
    const y = window.scrollY;
    window.scrollTo(5000, y);
    const hScroll = window.scrollX > 0 ? window.scrollX : 0;
    window.scrollTo(0, y);
    // Content past the right edge that NO scroll container owns. The page
    // clips sideways rather than scrolling, so hScroll alone reads 0 for a
    // card pushed to 609px on a 375px phone (verifier H3/H4, 2026-11-16).
    const vw = document.documentElement.clientWidth;
    const clipped = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.position === "fixed") continue;
      let owned = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox !== "visible") { owned = true; break; }
      }
      if (owned) continue;
      if (el.closest(".sr-only")) continue;
      clipped.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""} right=${Math.round(r.right)}`);
      if (clipped.length >= 5) break;
    }
    return {
      // What actually rendered. A signed-in user's stored theme overrides the
      // one this harness puts in localStorage (DesignPreferenceSync), and the
      // first tier-1 run recorded "dark" captures that had rendered light.
      renderedDesign: document.documentElement.getAttribute("data-design"),
      renderedMode: document.documentElement.getAttribute("data-seeded-mode"),
      title: document.title,
      // Visible h1s; the source may hold a second, display:none, layout
      // variant (counted separately so a crawler-facing duplicate is seen).
      h1: [...document.querySelectorAll("h1")].filter(vis).length,
      h1InSource: document.querySelectorAll("h1").length,
      h1Text: document.querySelector("h1")?.textContent?.trim().slice(0, 80) ?? null,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
      junk,
      smallTargets: smallTargets.slice(0, 12),
      smallTargetCount: smallTargets.length,
      smallText: smallText.slice(0, 12),
      smallTextCount: smallText.length,
      badLinks: badLinks.slice(0, 12),
      internalLinks: [...new Set(links.map((l) => l.href).filter((h) => h?.startsWith("/")))],
      imgsNoAlt,
      hScroll,
      clipped,
      cls: Math.round((window.__cls ?? 0) * 1000) / 1000,
      lcp: Math.round(window.__lcp ?? 0),
      textLength: text.length,
      spinnerOnly: text.trim().length < 20,
    };
  });
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
}

/* ------------------------------------------------------------------ run */

const personas = PERSONAS.filter((p) => (cfg.personas ? cfg.personas.includes(p.id) : true)).filter(
  (p) => ONLY.size === 0 || ONLY.has(p.id)
);

let count = 0;
const started = Date.now();
for (const browserName of cfg.browsers) {
  const browser = await LAUNCH[browserName]();
  for (const persona of personas) {
    const routes = cfg.routes ?? persona.routes;
    const ctx = await signIn(browser, persona, cfg.viewports[0]).catch((e) => {
      appendFileSync(RESULTS, JSON.stringify({ browser: browserName, persona: persona.id, signInError: String(e) }) + "\n");
      return null;
    });
    if (!ctx) continue;
    for (const theme of cfg.themes) {
      for (const vp of cfg.viewports) {
        for (const route of routes) {
          const page = await ctx.newPage();
          const zoom = theme === "zoom200";
          await page.setViewportSize(zoom ? { width: Math.round(vp.width / 2), height: Math.round(vp.height / 2) } : vp);
          if (theme === "system-dark") await page.emulateMedia({ colorScheme: "dark" });
          if (theme === "reduced-motion") await page.emulateMedia({ reducedMotion: "reduce" });
          await page.addInitScript(themeInit(theme));
          await page.addInitScript(PERF_INIT);
          const consoleErrors = [];
          const failed = [];
          page.on("console", (m) => {
            if (m.type() === "error" && !/_vercel\//.test(m.location()?.url ?? "") && !/_vercel\//.test(m.text())) consoleErrors.push(m.text().slice(0, 200));
          });
          page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
          page.on("response", (r) => {
            const u = r.url();
            if (u.startsWith(BASE) && r.status() >= 400 && !u.includes("/_vercel/") && r.request().resourceType() !== "document") failed.push(`${r.status()} ${u.replace(BASE, "")}`);
          });
          const rec = { browser: browserName, persona: persona.id, theme, width: vp.width, route };
          try {
            const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
            rec.status = resp?.status() ?? null;
            await page.waitForTimeout(400);
            await scrollThrough(page);
            rec.finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
            Object.assign(rec, await measure(page));
            if (cfg.axe && !route.endsWith(".txt") && !route.endsWith(".xml")) {
              await page.addScriptTag({ content: AXE });
              const res = await page.evaluate(async () => {
                const r = await window.axe.run(document, {
                  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
                });
                return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") }));
              });
              rec.axe = res;
            }
            if (cfg.shots && !route.endsWith(".txt") && !route.endsWith(".xml")) {
              const name = `${browserName}_${persona.id}_${theme}_${vp.width}_${route.replace(/\//g, "_") || "_root"}.jpg`;
              await page.screenshot({ path: join(OUT, "shots", name), fullPage: true, type: "jpeg", quality: 55 });
              rec.shot = name;
            }
          } catch (e) {
            rec.error = String(e).slice(0, 300);
          }
          rec.consoleErrors = consoleErrors.slice(0, 8);
          rec.failedRequests = failed.slice(0, 8);
          appendFileSync(RESULTS, JSON.stringify(rec) + "\n");
          await page.close();
          count++;
          if (count % 25 === 0) console.log(`${count} pages, ${Math.round((Date.now() - started) / 1000)}s`);
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
}
console.log(`done: ${count} page loads in ${Math.round((Date.now() - started) / 1000)}s -> ${RESULTS}`);
