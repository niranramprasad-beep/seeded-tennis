// Persona walkthroughs on a PRODUCTION build.
//
// Workstream B: nothing ships without a real-user walkthrough. This drives
// each persona through the public journey at 1440 and 375, in light and
// dark, writing screenshots to ~/seeded-evidence/final-pass/ and — the part
// that actually finds bugs — MEASURING the numbers each screen shows so
// cross-screen contradictions are detected rather than eyeballed.
//
// Screenshots prove a screen looked a certain way. They do not tell you the
// homepage promised 20 programs and the fit report then said 12. The
// `facts` block per screen is what catches that.
//
//   node scripts/persona-walk.mjs            # all personas
//   node scripts/persona-walk.mjs a c        # just those
//
// Usage note: this walks SIGNED-OUT journeys. Personas (f) and (g) need a
// session and are driven separately — see docs/archive/FINAL_PASS_REPORT.md.

import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME =
  process.env.AUDIT_CHROME ??
  join(
    process.env.HOME ?? "",
    "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
  );
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3100";
const OUT = process.env.WALK_OUT ?? join(process.env.HOME ?? "", "seeded-evidence/final-pass");

export const PERSONAS = [
  { id: "a", label: "Men's UTR 8.7, Class of 2031, GPA 3.5 — 7th grader, strong for age",
    q: "utr=8.7&gradYear=2031&gender=men&gpa=3.5" },
  { id: "b", label: "Women's UTR 6.0, Class of 2029, GPA 3.9 — average sophomore, strong academics",
    q: "utr=6.0&gradYear=2029&gender=women&gpa=3.9" },
  { id: "c", label: "Men's UTR 11.0, Class of 2027 — a senior in 2026-27, recruiting now",
    q: "utr=11.0&gradYear=2027&gender=men&gpa=3.5" },
  { id: "d", label: "Women's UTR 9.4, Class of 2026 — senior, late in the process",
    q: "utr=9.4&gradYear=2026&gender=women&gpa=3.5" },
  { id: "e", label: "Men's UTR 4.0, Class of 2030, no GPA — beginner, missing data",
    q: "utr=4.0&gradYear=2030&gender=men" },
];

const WIDTHS = [1440, 375];
const MODES = ["light", "dark"];

/** Everything a screen claims, pulled from rendered text. */
async function facts(page) {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const tabs = [...document.querySelectorAll("[role=tab]")].map((x) =>
      x.textContent.trim().replace(/\s+/g, " ")
    );
    const band = (s) => {
      const m = tabs.find((x) => x.startsWith(s));
      return m ? parseInt(m.split(/\s+/).pop(), 10) : null;
    };
    const panel = t.match(/Programs in range:\s*(\d+)\s*today\s*→\s*(\d+)/) || [];
    const headline = t.match(/^.*(?:on track for|in range for|realistic target for).*$/m)?.[0] ?? null;
    const hTL = headline?.match(/(\d+) Target and (\d+) Likely/);
    const hN = headline?.match(/(?:in range for|target for) (\d+)/);
    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      headline,
      headlineCount: hN ? +hN[1] : hTL ? +hTL[1] + +hTL[2] : null,
      reach: band("Reach"), target: band("Target"), likely: band("Likely"),
      panelToday: panel[1] ? +panel[1] : null,
      panelJunior: panel[2] ? +panel[2] : null,
      view: [...document.querySelectorAll('[aria-pressed="true"]')][0]?.textContent?.trim() ?? null,
      // Things that should never appear.
      showsZeroUtr: /\b0\.0\b/.test(t),
      notTrackedCount: (t.match(/Not tracked/g) || []).length,
      // Does the screen offer a next step at all?
      ctas: [...document.querySelectorAll("a,button")]
        .map((e) => e.textContent.trim())
        .filter((x) => x && x.length < 40).slice(0, 40),
      // Actually try to scroll. `documentElement.scrollWidth` is not a
      // reliable signal: on /pricing it reads 591 against a 375 viewport
      // while `body.scrollWidth` is 375, nothing's right edge exceeds the
      // viewport, and the page does not move — the number is inflated by
      // the comparison table's own `overflow-x-auto` container, which is
      // SUPPOSED to scroll inside itself. Reported a regression that did
      // not exist. What a user experiences is whether the page moves.
      horizontalScroll: (() => {
        const before = window.scrollX;
        window.scrollTo(500, window.scrollY);
        const moved = window.scrollX > 0;
        window.scrollTo(before, window.scrollY);
        return moved;
      })(),
      // Tap targets below 44px on mobile.
      //
      // Counting every <a> was useless: it reported 169 on /schools,
      // almost all of them links inside a sentence. WCAG exempts inline
      // links in a block of text for exactly this reason — you cannot give
      // a word in a paragraph a 44px box. Only standalone controls count:
      // buttons, inputs, selects, and links that are their own block.
      smallTapTargets:
        window.innerWidth < 500
          ? [...document.querySelectorAll("a,button,input,select,[role=button],[role=tab]")]
              .filter((e) => {
                const r = e.getBoundingClientRect();
                if (!(r.width > 0 && r.height > 0)) return false;
                // An element can enlarge its own hit area with an
                // absolutely-positioned ::after carrying a negative inset —
                // the only way to grow a 10px range-bar track without
                // moving the markers positioned inside it. getBoundingClientRect
                // cannot see that, so measure it directly rather than
                // reporting a problem that a thumb does not have.
                const after = getComputedStyle(e, "::after");
                let effective = r.height;
                if (after && after.content && after.content !== "none" && after.position === "absolute") {
                  const top = parseFloat(after.top || "0");
                  const bottom = parseFloat(after.bottom || "0");
                  if (!Number.isNaN(top) && !Number.isNaN(bottom)) {
                    effective = r.height - top - bottom;
                  }
                }
                if (effective >= 44) return false;
                if (r.height >= 44) return false;
                const cs = getComputedStyle(e);
                // Visually-hidden controls (sr-only) are 1px by design and
                // are not tap targets — they pair with a visible control.
                if (/\bsr-only\b/.test(String(e.className))) return false;
                // An input wrapped in a large enough <label> is fine: the
                // label is the tap target and clicking it toggles the
                // control. Counting the 20px box inside a 44px label
                // reported a problem that does not exist.
                const lbl = e.closest("label");
                if (lbl && lbl.getBoundingClientRect().height >= 44) return false;
                if (cs.position === "absolute" && r.height <= 2) return false;
                const display = cs.display;
                const inlineInText =
                  e.tagName === "A" &&
                  display === "inline" &&
                  e.parentElement &&
                  /^(P|LI|SPAN|TD|SMALL|STRONG|EM)$/.test(e.parentElement.tagName);
                return !inlineInText;
              })
              .map((e) => {
                const r = e.getBoundingClientRect();
                return `${e.tagName.toLowerCase()}:${Math.round(r.height)}px "${(e.textContent || "").trim().slice(0, 24)}"`;
              })
          : [],
    };
  });
}

async function shoot(page, name, width, mode) {
  mkdirSync(OUT, { recursive: true });
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.75);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 200));
  });
  await page.screenshot({ path: join(OUT, `${name}-${width}-${mode}.png`), fullPage: true });
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const chosen = only.length ? PERSONAS.filter((p) => only.includes(p.id)) : PERSONAS;

const browser = await chromium.launch({ executablePath: CHROME });
const report = { at: new Date().toISOString(), base: BASE, personas: [] };

/** Drive /onboarding's diagnostic to its fit report. Every action has a
 *  short timeout and is forced: the option rows are labels over hidden
 *  inputs, and a missed click must not hang the whole walk. */
async function answerDiagnostic(page) {
  const T = { timeout: 3000, force: true };
  const tryDo = async (fn) => { try { await fn(); return true; } catch { return false; } };
  for (let i = 0; i < 18; i++) {
    const see = page.getByText(/see my fit report/i);
    if (await see.count()) {
      await tryDo(() => see.first().click(T));
      await page.waitForTimeout(1500);
      return;
    }
    const heading = (await tryDo(async () => {})) && (await page.locator("main h1, main h2").first().innerText({ timeout: 2000 }).catch(() => ""));
    if (/who.?s filling/i.test(heading)) await tryDo(() => page.getByText(/i.?m the player/i).first().click(T));
    for (const sel of await page.locator("main select").all()) {
      const opts = await sel.locator("option").evaluateAll((os) => os.map((o) => o.value).filter(Boolean)).catch(() => []);
      if (opts.length && !(await sel.inputValue().catch(() => ""))) await tryDo(() => sel.selectOption(opts[Math.min(1, opts.length - 1)], { timeout: 3000 }));
    }
    if (/start college|plan to start/i.test(heading)) await tryDo(() => page.getByText(/fall after/i).first().click(T));
    const skip = page.getByRole("button", { name: /^skip/i });
    const cont = page.getByRole("button", { name: /^continue/i });
    const optional = /ago|around|gpa/i.test(heading);
    if (optional && (await skip.count())) await tryDo(() => skip.first().click(T));
    else if ((await cont.count()) && (await cont.first().isEnabled().catch(() => false))) await tryDo(() => cont.first().click(T));
    else if (await skip.count()) await tryDo(() => skip.first().click(T));
    else return;
    await page.waitForTimeout(300);
  }
}

for (const persona of chosen) {
  const entry = { ...persona, screens: {}, problems: [] };

  // The journey a first-time visitor actually takes.
  const SCREENS = [
    ["home", "/"],
    ["fit-report", `/onboarding?${persona.q}`],
    ["schools", "/schools"],
    ["school-page", "/schools/stanford-m"],
    ["tournament-fit", "/tournament-fit"],
    ["pricing", "/pricing"],
    ["methodology", "/methodology"],
    ["signup", "/signup"],
  ];

  for (const [name, path] of SCREENS) {
    for (const width of WIDTHS) {
      for (const mode of MODES) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: mode });
        const page = await ctx.newPage();
        const errors = [];
        const LOCAL_ONLY = /_vercel\/(insights|speed-insights)|Failed to load resource.*404/;
        page.on("console", (m) => { if (m.type() === "error" && !LOCAL_ONLY.test(m.text())) errors.push(m.text().slice(0, 200)); });
        page.on("pageerror", (e) => errors.push("pageerror: " + String(e.message).slice(0, 200)));
        await page.addInitScript((m) => {
          try {
            localStorage.setItem("seeded.design", "seeded");
            localStorage.setItem("seeded.mode", m);
            localStorage.setItem("seeded.mode.system", "0");
          } catch {}
        }, mode);
        await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(1200);
        // Since PR B, /onboarding is a nine-question diagnostic (board 20):
        // the prefilled link lands on question 1, not on a report. Answer it
        // the way this persona would — player, keep every prefilled answer,
        // skip the optional past ratings, pick a birth month/year and a
        // start term — then open the report the walk measures.
        if (name === "fit-report") await answerDiagnostic(page);

        if (width === 1440 && mode === "light") {
          entry.screens[name] = await facts(page);
          if (errors.length) entry.problems.push(`${name}: console ${errors[0]}`);
        }
        const f = await facts(page);
        if (f.horizontalScroll) entry.problems.push(`${name} @${width}/${mode}: horizontal scroll`);
        if (f.showsZeroUtr) entry.problems.push(`${name} @${width}/${mode}: renders a 0.0`);
        if (width === 375 && f.smallTapTargets.length > 0)
          entry.problems.push(
            `${name} @375/${mode}: ${f.smallTapTargets.length} tap targets under 44px — ${f.smallTapTargets.slice(0, 4).join(", ")}`
          );

        await shoot(page, `${persona.id}-${name}`, width, mode);
        await ctx.close();
      }
    }
  }

  // Cross-screen consistency: the homepage widget promises a number, the
  // fit report must show that same number for the same inputs.
  const fr = entry.screens["fit-report"];
  if (fr) {
    const inRange = (fr.target ?? 0) + (fr.likely ?? 0);
    if (fr.headlineCount !== inRange)
      entry.problems.push(`fit-report: headline ${fr.headlineCount} != tabs ${inRange}`);
    const panel = fr.view?.startsWith("By summer") ? fr.panelJunior : fr.panelToday;
    if (panel != null && panel !== inRange)
      entry.problems.push(`fit-report: panel ${panel} != tabs ${inRange}`);
  }

  report.personas.push(entry);
  console.log(
    `${persona.id} ${String(entry.problems.length).padStart(2)} problem(s)` +
      (entry.problems.length ? "\n   - " + entry.problems.join("\n   - ") : "")
  );
}

writeFileSync(join(OUT, "walkthrough.json"), JSON.stringify(report, null, 2));
await browser.close();
const total = report.personas.reduce((a, p) => a + p.problems.length, 0);
console.log(`\n${total} problem(s) across ${report.personas.length} personas → ${OUT}/walkthrough.json`);
