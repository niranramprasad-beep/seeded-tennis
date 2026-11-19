// PR C production sweep, C1–C30, as ONE scripted run against a production
// build on STAGING. Every item gets a concrete automated assertion where one
// is possible; the rest record what was looked at, with a screenshot.
//
//   npx next build && npx next start -p 3500        (in another terminal)
//   node scripts/sweep-c.mjs                         # all items
//   node scripts/sweep-c.mjs C1 C9                   # just those
//
// Signs in as the sweep persona (fake-sweep-player@example.com, men's,
// UTR 5.95, Class of 2029, Family tier, four targets) through the real
// /login form. The password is read from
// ~/seeded-evidence/production-sweep-1/.persona-pass and never printed.
// The browser runs in America/New_York so "today" is a real local day (C9).
//
// WRITES TO STAGING (as the persona, through the app's own UI):
//   C1  one training session (deleted again at the end, through the UI)
//   C2  one match result (deleted again in C6, through the UI)
//   C3  one tournament_entries row named "Sweep C3 <stamp>" (kept: it is
//       the proof that saving lands; no delete exists in the app)
//   C9  one utr_entries row at 5.95 dated today (5.95 again, so every
//       other item still sees 5.95)
//   C11 user_settings plan goal set to 9.00 and back to the estimate
//   C11 a target added and removed again
//   C18 today's check-in (upserted; one row per day)
//
// Writes ~/seeded-evidence/production-sweep-1/SWEEP.md and sweep/*.png.

import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "";
const BASE = process.env.SWEEP_BASE ?? "http://localhost:3500";
const EVID = join(HOME, "seeded-evidence/production-sweep-1");
const SHOTS = join(EVID, "sweep");
mkdirSync(SHOTS, { recursive: true });
const PASSWORD = readFileSync(join(EVID, ".persona-pass"), "utf8").trim();
const EMAIL = "fake-sweep-player@example.com";
const CHROME = join(
  HOME,
  "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
);
const TZ = "America/New_York";
const ONLY = new Set(process.argv.slice(2));
const STAMP = new Date().toISOString().slice(11, 16).replace(":", "");

// Today's local date in New York, the way the app's localDateKey() makes it.
const todayNY = (() => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p; // YYYY-MM-DD
})();
const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};
const shortDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/* ------------------------------------------------------------ reporting */

const REPORTED = {
  C1: '/events "Add session" opened the legacy Training drawer / generated plans; Week and Month disagreed.',
  C2: '/events "Log a result" was not the real result form; /match-mode existed; Results missing from sidebar and ⌘K.',
  C3: "Tournament checker → Add to my events: save did not land in Upcoming, no toast, date pre-filled, failures silent.",
  C4: "Manage billing went to /pricing; Whop links opened new tabs.",
  C5: '/plan "Show realistic targets" did nothing.',
  C6: "Deleting a match used window.confirm with no Undo.",
  C7: 'Today "History" did not open check-in history.',
  C8: "School page, /schools, /plan and /today showed different projected values.",
  C9: "A UTR logged today showed yesterday's date (UTC parse).",
  C10: "5.95 printed as 6.0 (school page, tournament checker, coach email subject, chips, charts).",
  C11: "/plan goal was the hardest target's floor; adding a target moved the checkpoint; Today lacked /plan's pace warning.",
  C12: 'Today said "all caught up" while on track for 0 targets.',
  C13: "Saved targets missing from the outreach board.",
  C14: "Recent results showed no opponent name.",
  C15: "Tournament checker gave a verdict before fee + level; copy disagreed with the field estimate.",
  C16: "Caveats repeated (NCAA note, 'isn't tracked yet', 'doesn't store coach contacts', early-decision line).",
  C17: "Gradients on app routes (⌘K, /matches, check-in, chips).",
  C18: "Check-in: two drawers, heatmap clipped at 320, no real notes box, no toast, layout jump.",
  C19: "Save UTR had no toast; input/chip not 2 decimals.",
  C20: '/events calendar squeezed, days hidden, sideways scroll, "6a" clipped, two "Add session".',
  C21: "Chart labels clipped (Today, Plan); y-axis missed the lowest logged value.",
  C22: "Big empty columns on Today/Events/school page; outreach editor narrow, short message box.",
  C23: "Data-like placeholders (Settings city/GPA, tournament fee, opponent UTR).",
  C24: '/plan had no H1; "Top (drawn)", "#1 of the D1 … combined score", "Live data, your own account."',
  C25: '/schools: two slider tracks, header count ≠ rows, "Acad." abbreviated, "Top 25" looked like a button.',
  C26: "Tournament checker not in sidebar; dark-mode toggle in two places; \"1 matches\" plurals.",
  C27: "/matches fields had no real labels.",
  C28: 'Outreach: Offer column clipped at 1440, fit-band chips on cards, disabled "Open in Gmail" unexplained, "Mark replied" misaligned.',
  C29: "Phone sweep (320/375): clipping, sideways scroll, things under the tab bar, small targets.",
  C30: '"Continue with Google" on /login, /signup and onboarding save, behind NEXT_PUBLIC_GOOGLE_AUTH_ENABLED; new Google user → /auth/complete.',
};

const rows = [];
const nativeDialogs = [];
const writes = [];
function record(id, after, status, evidence) {
  rows.push({ id, reported: REPORTED[id], after, status, evidence });
  console.log(`${status.padEnd(9)} ${id}  ${after}`);
}
const shotPath = (name) => join(SHOTS, `${name}.png`);
async function shot(page, name, full = true) {
  await page.screenshot({ path: shotPath(name), fullPage: full }).catch(() => {});
  return `sweep/${name}.png`;
}

/* --------------------------------------------------------------- browser */

const browser = await chromium.launch({ executablePath: CHROME });

async function signedInState() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1000);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}
const STATE = await signedInState();

function watch(ctx) {
  ctx.on("page", (p) => wirePage(p));
}
function wirePage(p) {
  // C6: ANY native dialog anywhere in the sweep is a failure.
  p.on("dialog", async (d) => {
    nativeDialogs.push(`${d.type()} "${d.message().slice(0, 80)}" on ${new URL(p.url()).pathname}`);
    await d.dismiss().catch(() => {});
  });
  p.on("response", (r) => {
    const m = r.request().method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && /\/rest\/v1\/|\/api\//.test(r.url())) {
      writes.push({ method: m, url: r.url().replace(/\?.*/, ""), status: r.status() });
    }
  });
}
async function context(width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: TZ, storageState: STATE });
  watch(ctx);
  return ctx;
}

const desk = await context();
const page = await desk.newPage();
const phone = await context(375, 812);
const ppage = await phone.newPage();

async function go(p, path) {
  await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1200);
}
const mainText = (p) => p.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const count = (s, re) => (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).length;
const noHScroll = (p) =>
  p.evaluate(() => {
    const y = window.scrollY;
    window.scrollTo(5000, y);
    const x = window.scrollX;
    window.scrollTo(0, y);
    return x === 0;
  });
const dialog = (p) => p.locator('[role="dialog"][aria-modal="true"]').last();
const toastText = async (p, re, timeout = 8000) => {
  const t = p.locator('[role="status"]').filter({ hasText: re }).first();
  await t.waitFor({ state: "visible", timeout }).catch(() => {});
  return (await t.count()) ? (await t.innerText()).trim() : null;
};
function writesSince(n, re) {
  return writes.slice(n).filter((w) => re.test(w.url));
}

// Every route the sweep visits, at 375, for the phone half of the evidence.
const phoneRoutes = {};
const phoneShot = (id, ...routes) => (phoneRoutes[id] = routes);

/* ----------------------------------------------------------------- items */

const ITEMS = {
  async C1() {
    phoneShot("C1", "/events");
    await go(page, "/training");
    const trainingRedirect = new URL(page.url()).pathname;
    await go(page, "/events");
    await page.getByRole("button", { name: "Add session", exact: true }).first().click();
    const d = dialog(page);
    await d.waitFor();
    const title = (await d.locator("h2").first().innerText()).trim();
    const labels = await d.locator("label").allInnerTexts();
    const dText = await d.innerText();
    const legacy = /suggest|template|generate|week plan|build week/i.test(dText);
    const want = ["Date", "Start time", "Length", "Type", "Note"];
    const haveAll = want.every((w) => labels.some((l) => l.trim().startsWith(w)));
    const ev1 = await shot(page, "C1-session-form-1440", false);
    // Add a real session two days out, 07:00, 45 min.
    const date = addDays(todayNY, 2);
    await d.getByLabel("Date").fill(date);
    await d.getByLabel("Start time").fill("07:00");
    await d.getByLabel("Length").selectOption("45");
    await d.getByLabel(/^Note/).fill(`Sweep C1 ${STAMP}`);
    const n = writes.length;
    await d.getByRole("button", { name: "Add session", exact: true }).click();
    await page.waitForTimeout(2500);
    const posted = writesSince(n, /training\/sessions/).filter((w) => w.status < 300);
    // Week vs Month: sessions per date for the current week.
    // Week grid: map each session block to the day column it sits in, by
    // x-position under the column headers ("Mon" / "16").
    const weekByDate = await page.evaluate(() => {
      const cal = document.querySelector('section[aria-labelledby="calendar-heading"]');
      const heads = [...cal.querySelectorAll("span")].filter((e) => /^(mon|tue|wed|thu|fri|sat|sun)$/i.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0);
      const sessions = [...cal.querySelectorAll('[role="button"][aria-label$="minutes. Edit."]')];
      const out = {};
      for (const h of heads) {
        const cell = h.parentElement;
        const r = cell.getBoundingClientRect();
        const day = Number(cell.textContent.replace(/\D/g, ""));
        out[day] = sessions.filter((s) => {
          const sr = s.getBoundingClientRect();
          const cx = sr.left + sr.width / 2;
          return cx >= r.left && cx <= r.right;
        }).length;
      }
      return out;
    });
    await page.getByRole("button", { name: "month", exact: true }).click();
    await page.waitForTimeout(600);
    const monthByDate = await page.evaluate(() => {
      const out = {};
      for (const b of document.querySelectorAll('button[aria-label$="Open this week."]')) {
        const l = b.getAttribute("aria-label");
        const m = l.match(/^(\w+), (\w+) (\d+), (?:(\d+) sessions?|no sessions)/);
        if (m) out[Number(m[3])] = m[4] ? Number(m[4]) : 0;
      }
      return out;
    });
    const ev2 = await shot(page, "C1-month-1440", false);
    await page.getByRole("button", { name: "week", exact: true }).click();
    await page.waitForTimeout(400);
    const mismatches = Object.entries(weekByDate).filter(([k, v]) => monthByDate[k] !== undefined && monthByDate[k] !== v);
    const compared = Object.keys(weekByDate).filter((k) => monthByDate[k] !== undefined).length;
    const ok = trainingRedirect === "/events" && /Add a session/.test(title) && haveAll && !legacy && posted.length > 0 && mismatches.length === 0 && compared === 7;
    record(
      "C1",
      `/training → ${trainingRedirect}; form "${title}" with ${want.join("/")} = ${haveAll}; legacy words ${legacy ? "PRESENT" : "absent"}; save → ${posted.length} write(s) 2xx; week vs month compared on ${compared} days, ${mismatches.length} mismatch${mismatches.length === 1 ? "" : "es"} ${mismatches.length ? JSON.stringify(mismatches) : ""}`,
      ok ? "fixed" : "not fixed",
      `${ev1}, ${ev2}; week ${JSON.stringify(weekByDate)}`
    );
    ITEMS._c1date = date;
  },

  async C2() {
    phoneShot("C2", "/events", "/matches");
    await go(page, "/matches");
    const pageLabels = (await page.locator("main form label").allInnerTexts()).map((s) => s.trim().split("\n")[0]);
    await go(page, "/events");
    await page.getByRole("button", { name: "Log a result", exact: true }).first().click();
    const d = dialog(page);
    await d.waitFor();
    const drawerLabels = (await d.locator("form label").allInnerTexts()).map((s) => s.trim().split("\n")[0]);
    const same = JSON.stringify(drawerLabels) === JSON.stringify(pageLabels) && drawerLabels.length >= 8;
    await d.getByLabel("Win", { exact: true }).check({ force: true }).catch(async () => d.getByText("Win", { exact: true }).click());
    await d.getByLabel("Opponent", { exact: true }).fill("Sweep C2 Opponent");
    await d.getByLabel(/Opponent UTR/).fill("6.25");
    await d.getByLabel("Score", { exact: true }).fill("6-2, 6-1");
    const ev1 = await shot(page, "C2-log-result-drawer-1440", false);
    const n = writes.length;
    await d.getByRole("button", { name: "Save result" }).click();
    await page.waitForTimeout(2500);
    const posted = writesSince(n, /\/rest\/v1\/matches|\/api\/matches/).filter((w) => w.status < 300);
    await go(page, "/match-mode");
    const mm = new URL(page.url()).pathname;
    const sideResults = await page.locator('aside a[href="/matches"], nav a[href="/matches"]').filter({ hasText: "Results" }).count();
    await page.keyboard.press("Meta+k");
    const pal = page.getByRole("dialog", { name: "Command palette" });
    await pal.waitFor({ timeout: 5000 }).catch(() => {});
    const palText = (await pal.count()) ? await pal.innerText() : "";
    const ev2 = await shot(page, "C2-cmdk-1440", false);
    await page.keyboard.press("Escape");
    const ok = same && posted.length > 0 && mm === "/matches" && sideResults > 0 && /Results/.test(palText);
    record(
      "C2",
      `drawer fields = /matches form fields: ${same} (${drawerLabels.length} labels); saved → ${posted.length} matches write(s) 2xx; /match-mode → ${mm}; sidebar "Results" links: ${sideResults}; ⌘K lists Results: ${/Results/.test(palText)}`,
      ok ? "fixed" : "not fixed",
      `${ev1}, ${ev2}`
    );
  },

  async C3() {
    phoneShot("C3", "/tournament-fit", "/events");
    await go(page, "/tournament-fit");
    const name = `Sweep C3 ${STAMP}`;
    await page.getByLabel("Tournament name").fill(name);
    await page.getByRole("button", { name: "L5", exact: true }).click();
    await page.getByLabel("Entry fee").fill("60");
    await page.getByRole("button", { name: "Add to my events" }).click();
    const d = dialog(page);
    await d.waitFor();
    const dateBlank = (await d.getByLabel("Tournament date").inputValue()) === "";
    const placeholders = await d.locator("input").evaluateAll((els) => els.map((e) => e.getAttribute("placeholder")).filter(Boolean));
    // Failure path: submit with nothing filled → each field says why.
    await d.getByLabel("City").fill("");
    await d.getByRole("button", { name: "Save to my events" }).click();
    await page.waitForTimeout(500);
    const errs = await d.locator('[id$="-error"], [role="alert"]').allInnerTexts();
    const ev1 = await shot(page, "C3-errors-1440", false);
    await d.getByLabel("Tournament date").fill(addDays(todayNY, 30));
    await d.getByLabel("City").fill("Testville");
    await d.getByLabel("State").fill("VA");
    const n = writes.length;
    await d.getByRole("button", { name: "Save to my events" }).click();
    const toast = await toastText(page, /Saved\./);
    await page.waitForTimeout(1500);
    const posted = writesSince(n, /tournament_entries/).filter((w) => w.status < 300);
    const ev2 = await shot(page, "C3-saved-toast-1440", false);
    await go(page, "/events");
    const inUpcoming = (await page.locator("section, div").filter({ hasText: /^Upcoming tournaments/ }).first().innerText().catch(() => "")).includes(name) || (await mainText(page)).includes(name);
    const ev3 = await shot(page, "C3-upcoming-1440");
    const ok = dateBlank && errs.length > 0 && posted.length > 0 && !!toast && inUpcoming && placeholders.length === 0;
    record(
      "C3",
      `date blank by default: ${dateBlank}; empty save → ${errs.length} error(s) ("${(errs[0] ?? "").slice(0, 40)}"); save → ${posted.length} tournament_entries write(s) 2xx, toast "${toast ?? "none"}"; "${name}" in Upcoming: ${inUpcoming}; drawer placeholders: ${placeholders.length ? JSON.stringify(placeholders) : "none"}`,
      ok ? "fixed" : "not fixed",
      `${ev1}, ${ev2}, ${ev3}; staging row: tournament_entries "${name}"`
    );
  },

  async C4() {
    phoneShot("C4", "/settings/billing");
    const found = [];
    for (const path of ["/settings", "/settings/billing", "/pricing", "/today"]) {
      await go(page, path);
      // open the Account tab when there is one
      if (path === "/settings") await page.getByRole("button", { name: "Account", exact: true }).click().catch(() => {});
      await page.waitForTimeout(300);
      const links = await page.locator("a").evaluateAll((as) =>
        as.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href"), target: a.getAttribute("target") }))
      );
      for (const l of links) if (/manage billing/i.test(l.text) || /whop\.com/.test(l.href ?? "")) found.push({ path, ...l });
      // "Manage billing" buttons: where does each one go?
      const btns = page.getByRole("button", { name: /manage billing/i });
      for (let i = 0; i < (await btns.count()); i++) {
        const before = page.url();
        await btns.nth(i).click();
        await page.waitForURL((u) => u.href !== before, { timeout: 6000 }).catch(() => {});
        found.push({ path, text: "Manage billing (button)", href: new URL(page.url()).pathname, target: null });
        if (page.url() !== before) await go(page, path);
        if (path === "/settings") await page.getByRole("button", { name: "Account", exact: true }).click().catch(() => {});
      }
    }
    const toPricing = found.filter((l) => /manage billing/i.test(l.text) && !/^\/settings\/billing/.test(l.href ?? ""));
    const newTab = found.filter((l) => /whop\.com/.test(l.href ?? "") && l.target === "_blank");
    await go(page, "/settings");
    await page.getByRole("button", { name: "Account", exact: true }).click().catch(() => {});
    const mb = page.getByRole("button", { name: /manage billing/i }).or(page.getByRole("link", { name: /manage billing/i })).first();
    let landed = "(no Manage billing link)";
    if (await mb.count()) {
      await mb.click();
      await page.waitForURL((u) => u.pathname !== "/settings", { timeout: 8000 }).catch(() => {});
      landed = new URL(page.url()).pathname;
    }
    const ev = await shot(page, "C4-billing-1440");
    const ok = toPricing.length === 0 && newTab.length === 0 && landed === "/settings/billing";
    record(
      "C4",
      `${found.filter((l) => /manage billing/i.test(l.text)).length} "Manage billing" control(s) seen (${[...new Set(found.filter((l) => /manage billing/i.test(l.text)).map((l) => `${l.path}→${l.href}`))].join(", ")}), ${toPricing.length} not to /settings/billing; clicking it lands on ${landed}; whop.com links with target=_blank: ${newTab.length} (of ${found.filter((l) => /whop/.test(l.href ?? "")).length} Whop links rendered — staging cannot reach Whop, so the portal link is not drawn here)`,
      ok ? "fixed" : "not fixed",
      `${ev}; ${JSON.stringify(found).slice(0, 300)}`
    );
  },

  async C5() {
    phoneShot("C5", "/plan");
    await go(page, "/plan");
    const btn = page.getByRole("button", { name: /Show realistic targets/ });
    if (!(await btn.count())) {
      const ev = await shot(page, "C5-plan-1440");
      record("C5", "button not offered (it is only offered when it would hide something)", "fixed", ev);
      return;
    }
    const label = (await btn.innerText()).trim();
    const handle = await btn.elementHandle();
    const listCount = async () => page.getByRole("button", { name: /^Remove .* from your targets$/ }).count();
    const before = await listCount();
    await handle.click();
    await page.waitForTimeout(600);
    const pressed = await handle.getAttribute("aria-pressed");
    const labelOn = (await handle.innerText()).trim();
    const after = await listCount();
    const m = label.match(/\((\d+) of (\d+)\)/);
    const expected = m ? Number(m[1]) : null;
    const ev = await shot(page, "C5-realistic-on-1440");
    await handle.click();
    await page.waitForTimeout(300);
    const restored = await listCount();
    const ok = pressed === "true" && expected !== null && after === expected && restored === before;
    record(
      "C5",
      `"${label}" → "${labelOn}": target rows ${before} → ${after} when on (label promised ${expected}), aria-pressed=${pressed}, back to ${restored} when off`,
      ok ? "fixed" : "not fixed",
      ev
    );
  },

  async C6() {
    phoneShot("C6", "/matches");
    await go(page, "/matches");
    const card = () =>
      page
        .locator("li, article, div")
        .filter({ hasText: "Sweep C2 Opponent" })
        .filter({ has: page.getByRole("button", { name: /^Delete the .* result$/ }) })
        .last();
    if (!(await card().count())) {
      record("C6", "the C2 result was not found on /matches to delete", "not fixed", "");
      return;
    }
    const before = await page.getByText("Sweep C2 Opponent").count();
    await card().getByRole("button", { name: /^Delete the .* result$/ }).click();
    const d = dialog(page);
    await d.waitFor({ timeout: 5000 });
    const dTitle = (await d.innerText()).split("\n")[0];
    const ev1 = await shot(page, "C6-seeded-dialog-1440", false);
    await d.getByRole("button", { name: "Delete", exact: true }).click();
    const t = await toastText(page, /Result deleted/);
    await page.waitForTimeout(800);
    const gone = (await page.getByText("Sweep C2 Opponent").count()) < before;
    const ev2 = await shot(page, "C6-undo-toast-1440", false);
    // Undo, then delete for real so staging is left as it was.
    await page.locator('[role="status"]').getByRole("button", { name: "Undo" }).click().catch(() => {});
    await page.waitForTimeout(2500);
    const back = (await page.getByText("Sweep C2 Opponent").count()) === before;
    if (await card().count()) {
      await card().getByRole("button", { name: /^Delete the .* result$/ }).click();
      await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
      await page.waitForTimeout(2500);
    }
    const cleaned = (await page.getByText("Sweep C2 Opponent").count()) === 0;
    ITEMS._c6 = { dTitle, t, gone, back, cleaned };
    // Session delete also goes through the Seeded dialog (+ Undo): C1's session.
    let sessionDialog = "not tried";
    if (ITEMS._c1date) {
      await go(page, "/events");
      const s = page.locator('[role="button"][aria-label="Tennis, 07:00, 45 minutes. Edit."]');
      if (await s.count()) {
        await s.first().click();
        await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
        await page.waitForTimeout(500);
        const confirm = dialog(page);
        const ct = (await confirm.count()) ? (await confirm.innerText()).split("\n")[0] : "";
        const del = confirm.getByRole("button", { name: /^Delete/ }).last();
        if (await del.count()) await del.click();
        const st = await toastText(page, /deleted|removed/i);
        sessionDialog = `dialog "${ct}", toast "${st ?? "none"}"`;
        await page.waitForTimeout(1500);
      } else sessionDialog = "C1 session not found";
    }
    const ok = /Delete this result\?/.test(dTitle) && /Undo/.test(t ?? "") && gone && back && nativeDialogs.length === 0;
    ITEMS._c6row = {
      after: `delete → Seeded dialog "${dTitle}"; toast "${t ?? "none"}"; row gone ${gone}; Undo restored ${back}; cleaned up ${cleaned}; session delete: ${sessionDialog}; native dialogs so far: ${nativeDialogs.length}`,
      ok,
      ev: `${ev1}, ${ev2}`,
    };
  },

  async C7() {
    phoneShot("C7", "/today", "/today/check-ins");
    await go(page, "/today");
    const link = page.getByRole("link", { name: /history/i }).first();
    const label = (await link.count()) ? (await link.innerText()).trim() : "(none)";
    if (await link.count()) await link.click();
    await page.waitForURL((u) => u.pathname !== "/today", { timeout: 8000 }).catch(() => {});
    const path = new URL(page.url()).pathname;
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    const ev = await shot(page, "C7-history-1440");
    record("C7", `"${label}" → ${path}, H1 "${h1}"`, path === "/today/check-ins" && /Check-ins/.test(h1) ? "fixed" : "not fixed", ev);
  },

  async C8() {
    phoneShot("C8", "/today", "/schools", "/plan", "/schools/duke-m");
    const est = /estimated UTR for summer \d{4}[^:]*:\s*(\d+\.\d+)/;
    const got = {};
    await go(page, "/today");
    got.today = (await mainText(page)).match(est)?.[1];
    await go(page, "/plan");
    const plan = await mainText(page);
    got.plan = plan.match(est)?.[1];
    got.planGoal = plan.match(/Goal:\s*(\d+\.\d+)\s*\(your estimate\)/)?.[1];
    await go(page, "/schools");
    got.schools = (await mainText(page)).match(/You \(est\. summer \d{4}\)\s*(\d+\.\d+)/)?.[1];
    await go(page, "/schools/duke-m");
    const school = await mainText(page);
    got.schoolPage = school.match(/Estimated (\d+\.\d+) by/)?.[1];
    got.schoolPageYou = school.match(/You \(est\. summer \d{4}\)\s*(\d+\.\d+)/)?.[1];
    const ev = await shot(page, "C8-school-page-1440");
    const vals = Object.values(got).filter(Boolean).map(Number);
    const ok = vals.length === Object.keys(got).length && vals.every((v) => Math.abs(v - vals[0]) < 0.005);
    record("C8", `projected value: ${JSON.stringify(got)}`, ok ? "fixed" : "not fixed", ev);
  },

  async C9_C19() {
    phoneShot("C9", "/today", "/plan");
    phoneShot("C19", "/today");
    await go(page, "/today");
    const chipBefore = (await mainText(page)).match(/UTR\s+(\d+\.\d+)/)?.[1];
    await page.getByRole("button", { name: "Update UTR" }).first().click();
    const d = dialog(page);
    await d.waitFor();
    const input = await d.getByLabel("Current UTR").inputValue();
    const dateDefault = await d.getByLabel("Date").inputValue();
    const ev1 = await shot(page, "C19-utr-drawer-1440", false);
    await d.getByLabel("Current UTR").fill("5.95");
    const n = writes.length;
    await d.getByRole("button", { name: /Save UTR entry/ }).click();
    const t = await toastText(page, /UTR .* saved/);
    const ev2 = await shot(page, "C19-utr-toast-1440", false);
    await page.waitForTimeout(1500);
    const posted = writesSince(n, /utr/i).filter((w) => w.status < 300);
    const chipAfter = (await mainText(page)).match(/UTR\s+(\d+\.\d+)/)?.[1];
    await go(page, "/plan");
    const planDate = (await mainText(page)).match(/self-reported ([A-Z][a-z]{2} \d+)/)?.[1];
    await go(page, "/tournament-fit");
    const tfDate = (await mainText(page)).match(/self-reported ([A-Z][a-z]{2} \d+)/)?.[1];
    const ev3 = await shot(page, "C9-plan-date-1440");
    const today = shortDate(todayNY);
    const ok9 = dateDefault === todayNY && planDate === today && tfDate === today && t?.includes(today) && posted.length > 0;
    record(
      "C9",
      `browser in ${TZ}, today ${todayNY}; drawer date defaults to ${dateDefault}; toast "${t ?? "none"}"; /plan says "self-reported ${planDate}", tournament checker "self-reported ${tfDate}" (want ${today})`,
      ok9 ? "fixed" : "not fixed",
      `${ev3}; staging row: utr_entries 5.95 @ ${todayNY}`
    );
    const ok19 = /^\d+\.\d{2}$/.test(input) && chipBefore === "5.95" && chipAfter === "5.95" && /UTR 5\.95 saved/.test(t ?? "");
    record(
      "C19",
      `input opened at "${input}"; chip "${chipBefore}" → "${chipAfter}"; toast "${t ?? "none"}"`,
      ok19 ? "fixed" : "not fixed",
      `${ev1}, ${ev2}`
    );
  },

  async C10() {
    phoneShot("C10", "/schools/duke-m", "/tournament-fit", "/outreach", "/today", "/plan");
    const seen = {};
    const bad = [];
    const sixOh = /(UTR|You|you're|You're|today|rating)\s*:?\s*6\.0(?!\d)|6\.0 \(self-reported\)/;
    for (const path of ["/today", "/plan", "/schools", "/schools/duke-m", "/tournament-fit", "/outreach", "/events"]) {
      await go(page, path);
      const t = (await mainText(page)) + "\n" + (await page.locator("main input, main textarea").evaluateAll((els) => els.map((e) => e.value).join("\n")));
      seen[path] = count(t, /5\.95/g);
      const m = t.match(sixOh);
      if (m) bad.push(`${path}: …${t.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ")}…`);
    }
    await go(page, "/tournament-fit");
    const tf = await page.locator("#tf-utr").inputValue();
    await go(page, "/outreach");
    const subject = await page.getByLabel("Subject").inputValue().catch(() => "");
    const body = await page.getByLabel("Message").inputValue().catch(() => "");
    const ev = await shot(page, "C10-coach-email-1440");
    // /schools prints only the summer-2028 estimate per row, never today's rating.
    const mustShow = ["/today", "/plan", "/schools/duke-m", "/tournament-fit", "/outreach", "/events"];
    const ok = bad.length === 0 && tf === "5.95" && /5\.95/.test(subject) && !/6\.0\b/.test(subject + body) && mustShow.every((p) => seen[p] > 0);
    record(
      "C10",
      `"5.95" occurrences ${JSON.stringify(seen)}; checker input "${tf}"; email subject "${subject}"; 6.0-as-the-player's-rating hits: ${bad.length ? bad.join(" | ") : "none"}`,
      ok ? "fixed" : "not fixed",
      ev
    );
  },

  async C11() {
    phoneShot("C11", "/plan", "/today");
    await go(page, "/plan");
    let plan = await mainText(page);
    const goal = plan.match(/Goal:\s*(\d+\.\d+)/)?.[1];
    const floors = [...plan.matchAll(/Floor (\d+\.\d+)/g)].map((m) => Number(m[1]));
    const hardest = Math.max(...floors);
    const goalNotFloor = goal && Number(goal) !== hardest;
    await go(page, "/today");
    const cp = async () => (await mainText(page)).match(/Next checkpoint:\s*([\d.]+ by [A-Z][a-z]{2} \d+, \d{4})/)?.[1];
    const cpBefore = await cp();
    // add a target (Family tier: no cap), recheck, remove it again
    await go(page, "/plan");
    const add = page.getByRole("button", { name: /^Add .* to your targets$/ }).first();
    const addName = (await add.getAttribute("aria-label"))?.replace(/^Add | to your targets$/g, "");
    await add.click();
    await page.waitForTimeout(2000);
    await go(page, "/today");
    const cpAfterAdd = await cp();
    await go(page, "/plan");
    await page.getByRole("button", { name: `Remove ${addName} from your targets` }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    // pace warning: choose an unrealistic goal, compare /plan and /today, reset
    await page.getByRole("button", { name: "Set a goal" }).click();
    await page.getByLabel(/Your goal by the summer before senior year/).fill("9.00");
    await page.getByRole("button", { name: "Save goal" }).click();
    await page.waitForTimeout(2500);
    const warnPlan = await page.locator('[role="status"]').filter({ hasText: /Reaching 9\.00 by/ }).first().innerText().catch(() => "");
    const ev1 = await shot(page, "C11-plan-warning-1440");
    await go(page, "/today");
    const warnToday = await page.locator('[role="status"]').filter({ hasText: /Reaching 9\.00 by/ }).first().innerText().catch(() => "");
    const ev2 = await shot(page, "C11-today-warning-1440");
    const reset = page.getByRole("button", { name: /^Use .* instead$/ }).first();
    if (await reset.count()) await reset.click();
    await page.waitForTimeout(2500);
    await go(page, "/plan");
    plan = await mainText(page);
    const goalRestored = /\(your estimate\)/.test(plan);
    const ok = goalNotFloor && cpBefore && cpBefore === cpAfterAdd && warnPlan && warnPlan.trim() === warnToday.trim() && goalRestored;
    record(
      "C11",
      `goal ${goal} vs hardest floor ${hardest}; Today checkpoint "${cpBefore}" → "${cpAfterAdd}" after adding ${addName} (removed again); goal 9.00 → /plan warning "${warnPlan.trim().slice(0, 70)}…", Today identical: ${warnPlan.trim() === warnToday.trim() && !!warnPlan}; goal reset to estimate: ${goalRestored}`,
      ok ? "fixed" : "not fixed",
      `${ev1}, ${ev2}`
    );
  },

  async C12() {
    phoneShot("C12", "/today");
    await go(page, "/today");
    const t = await mainText(page);
    const head = t.split("\n").find((l) => /^Good (morning|afternoon|evening)/.test(l)) ?? "";
    const onTrack = t.match(/On track for (\d+) of (\d+) targets/);
    const caught = /caught up/i.test(t);
    const actions = t.split("Your actions")[1]?.split(/Done this week|Log check-in/)[0] ?? "";
    const steps = await page.locator("main").getByRole("link").filter({ hasText: /Find schools|Check a tournament|Log|Add|Draft|Email|Update/ }).count();
    const ev = await shot(page, "C12-today-1440");
    const ok = onTrack && !caught && /next steps?/.test(head) && steps >= 1;
    record(
      "C12",
      `headline "${head}"; "${onTrack?.[0]}"; "caught up" present: ${caught}; action rows: ${actions.trim().split("\n").filter((l) => l.length > 12).length}, links ${steps}`,
      ok ? "fixed" : "not fixed",
      ev
    );
  },

  async C13() {
    phoneShot("C13", "/outreach");
    await go(page, "/outreach");
    const t = await mainText(page);
    const header = t.match(/(\d+) programs? ·/)?.[1];
    const cards = await page.getByRole("button", { name: /^Remind me in/ }).count();
    const names = ["Duke", "Virginia Tech", "Penn", "Tulane"].filter((n) => t.includes(n));
    const ev = await shot(page, "C13-outreach-1440");
    record(
      "C13",
      `header "${header} programs"; ${cards} cards on the board; targets on board: ${names.join(", ")}`,
      header === "4" && cards === 4 && names.length === 4 ? "fixed" : "not fixed",
      ev
    );
  },

  async C14() {
    phoneShot("C14", "/events", "/plan", "/matches");
    const out = {};
    for (const path of ["/events", "/plan", "/matches"]) {
      await go(page, path);
      const t = await mainText(page);
      out[path] = { named: count(t, /vs Sweep Opponent/g), anonymous: count(t, /vs opponent \d/g) };
    }
    const ev = await shot(page, "C14-plan-1440");
    const ok = Object.values(out).every((o) => o.named > 0 && o.anonymous === 0);
    record("C14", `opponent named per page: ${JSON.stringify(out)}`, ok ? "fixed" : "not fixed", ev);
  },

  async C15() {
    phoneShot("C15", "/tournament-fit");
    await go(page, "/tournament-fit");
    const verdictShown = async () => page.locator("h2").filter({ hasText: /fit|worth|skip|stretch|reach|good|great/i }).count();
    const s0 = { text: /To see a verdict/.test(await mainText(page)), h: await verdictShown() };
    await page.getByRole("button", { name: "L5", exact: true }).click();
    await page.waitForTimeout(300);
    const t1 = await mainText(page);
    const s1 = { text: /To see a verdict/.test(t1), h: await verdictShown() };
    const field = t1.match(/Typical field for this level:\s*UTR ([\d.]+[–-][\d.]+)/)?.[1];
    await page.getByLabel("Entry fee").fill("60");
    await page.waitForTimeout(400);
    const t2 = await mainText(page);
    const s2 = { text: /To see a verdict/.test(t2), h: await verdictShown() };
    const blurb = t2.split(/VERDICT/i)[1]?.split("Competition")[0]?.trim() ?? "";
    const agrees = field ? blurb.includes(field) || !/UTR \d/.test(blurb) : false;
    const avg = /avg \d/.test(t2);
    const ev = await shot(page, "C15-verdict-1440");
    const ok = s0.text && !s0.h && s1.text && !s1.h && !s2.text && s2.h > 0 && agrees && !avg;
    record(
      "C15",
      `no level/fee: prompt ${s0.text}, verdict ${s0.h}; level only: prompt ${s1.text}, verdict ${s1.h}; level+fee: verdict ${s2.h}; field "UTR ${field}", verdict text "${blurb.replace(/\s+/g, " ").slice(0, 110)}" agrees: ${agrees}; "avg N" wording: ${avg}`,
      ok ? "fixed" : "not fixed",
      ev
    );
  },

  async C16() {
    phoneShot("C16", "/plan", "/schools", "/outreach");
    await go(page, "/plan");
    const plan = await mainText(page);
    const ncaa = count(plan, /General NCAA contact-period guidance/g);
    await go(page, "/schools");
    await page.getByRole("button", { name: "Show fit detail for Duke" }).click();
    await page.waitForTimeout(600);
    // Only Duke's row is expanded, so the page count is the row's count.
    const rowText = await mainText(page);
    const tracked = count(rowText, /tracked yet/g);
    const ev1 = await shot(page, "C16-schools-expanded-1440");
    const early = {};
    for (const path of ["/today", "/schools", "/plan", "/schools/duke-m"]) {
      await go(page, path);
      early[path] = count(await mainText(page), /Top D1 programs often decide earlier/g);
    }
    await go(page, "/outreach");
    const contacts = count(await mainText(page), /doesn['’]t store coach contacts/g);
    const ev2 = await shot(page, "C16-outreach-1440");
    const earlyTotal = Object.values(early).reduce((a, b) => a + b, 0);
    const ok = ncaa === 1 && tracked === 1 && contacts === 1 && earlyTotal === 1;
    record(
      "C16",
      `NCAA note on /plan ×${ncaa}; "tracked yet" in Duke's expanded row ×${tracked}; "doesn't store coach contacts" on /outreach ×${contacts}; early-decision line ${JSON.stringify(early)}`,
      ok ? "fixed" : "not fixed",
      `${ev1}, ${ev2}`
    );
  },

  async C17() {
    phoneShot("C17", "/matches");
    const scan = (p) =>
      p.evaluate(() => {
        const hits = [];
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          for (const prop of ["backgroundImage", "borderImageSource", "maskImage"]) {
            const v = cs[prop];
            if (v && /gradient\(/.test(v)) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) hits.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} ${prop}`);
            }
          }
          // background-clip:text gradient headlines
        }
        return hits;
      });
    const out = {};
    for (const path of ["/today", "/plan", "/events", "/matches", "/schools", "/outreach", "/tournament-fit", "/settings", "/today/check-ins"]) {
      await go(page, path);
      out[path] = await scan(page);
    }
    await go(page, "/matches");
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);
    out["⌘K"] = await scan(page);
    const ev1 = await shot(page, "C17-cmdk-1440", false);
    await page.keyboard.press("Escape");
    await go(page, "/today");
    await page.getByRole("button", { name: "Log check-in" }).first().click();
    await page.waitForTimeout(600);
    out["check-in drawer"] = await scan(page);
    const ev2 = await shot(page, "C17-checkin-1440", false);
    await page.keyboard.press("Escape");
    const total = Object.values(out).reduce((a, b) => a + b.length, 0);
    record(
      "C17",
      `computed CSS gradients on ${Object.keys(out).length} app screens/overlays: ${total}${total ? " — " + JSON.stringify(Object.fromEntries(Object.entries(out).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, 3)]))) : ""}`,
      total === 0 ? "fixed" : "not fixed",
      `${ev1}, ${ev2}`
    );
  },

  async C18() {
    phoneShot("C18", "/today");
    const ctx = await context(320, 700);
    const p = await ctx.newPage();
    await go(p, "/today");
    await p.evaluate(() => {
      window.__shift = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value;
      }).observe({ type: "layout-shift", buffered: false });
    });
    await p.getByRole("button", { name: "Log check-in" }).first().click();
    const d = dialog(p);
    await d.waitFor();
    await p.waitForTimeout(700);
    const dialogs = await p.locator('[role="dialog"]').evaluateAll((ds) => ds.filter((x) => x.getBoundingClientRect().width > 0).length);
    const geo = await d.evaluate((el) => {
      const dr = el.getBoundingClientRect();
      const sec = [...el.querySelectorAll("section")].find((s) => /Last 30 days/.test(s.textContent));
      const vis = [...(sec?.querySelectorAll("*") ?? [])].map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0);
      const right = Math.max(...vis.map((r) => r.right));
      const ta = el.querySelector("textarea");
      const save = [...el.querySelectorAll("button")].find((b) => /Save check-in/.test(b.textContent));
      const sr = save?.getBoundingClientRect();
      // is the save button covered by anything (e.g. the phone tab bar)?
      const top = sr ? document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2) : null;
      return {
        drawerRight: Math.round(dr.right),
        vw: document.documentElement.clientWidth,
        heatmapRight: Math.round(right),
        notesLabel: ta ? !!(ta.labels?.length && /Notes/.test(ta.labels[0].textContent)) : false,
        notesHeight: ta ? Math.round(ta.getBoundingClientRect().height) : 0,
        saveH: sr ? Math.round(sr.height) : 0,
        saveW: sr ? Math.round(sr.width) : 0,
        saveCovered: top ? !save.contains(top) : true,
      };
    });
    const ev1 = await shot(p, "C18-checkin-320", false);
    await d.locator("label").filter({ hasText: /^4$/ }).click();
    await d.getByLabel("Notes", { exact: false }).fill(`Sweep C18 check-in ${STAMP}`);
    const saveBtn = d.getByRole("button", { name: /Save check-in/ });
    const b1 = await saveBtn.boundingBox();
    const n = writes.length;
    await saveBtn.click();
    const t = await toastText(p, /Check-in saved/);
    const ev2 = await shot(p, "C18-toast-320", false);
    await p.waitForTimeout(1200);
    const posted = writesSince(n, /check/).filter((w) => w.status < 300);
    const shift = await p.evaluate(() => Math.round(window.__shift * 1000) / 1000);
    await ctx.close();
    const ok = dialogs === 1 && geo.heatmapRight <= geo.drawerRight && geo.drawerRight <= geo.vw && geo.notesLabel && geo.notesHeight >= 100 && !!t && posted.length > 0 && shift < 0.05 && !geo.saveCovered;
    record(
      "C18",
      `at 320: ${dialogs} drawer open; heatmap right ${geo.heatmapRight} ≤ drawer ${geo.drawerRight} ≤ viewport ${geo.vw}; labelled Notes box ${geo.notesLabel}, ${geo.notesHeight}px tall; Save ${geo.saveW}×${geo.saveH}, covered by another layer: ${geo.saveCovered}; save → ${posted.length} write(s), toast "${t ?? "none"}"; layout shift during the flow ${shift}`,
      ok ? "fixed" : "not fixed",
      `${ev1}, ${ev2}; staging row: today's daily check-in (upsert)`
    );
    void b1;
  },

  async C20() {
    phoneShot("C20", "/events");
    await go(page, "/events");
    const g = await page.evaluate(() => {
      const cal = document.querySelector('section[aria-labelledby="calendar-heading"]');
      const main = document.querySelector("main");
      const cr = cal.getBoundingClientRect();
      const region = cal.querySelector('[role="region"]');
      const rr = region?.getBoundingClientRect();
      const heads = [...cal.querySelectorAll("*")].filter((e) => /^(mon|tue|wed|thu|fri|sat|sun)$/i.test(e.textContent.trim()) && e.children.length === 0);
      // The grid opens on the afternoon; scroll it to the top to see 6 am.
      if (region) region.scrollTop = 0;
      const visibleHeads = heads.filter((h) => {
        const r = h.getBoundingClientRect();
        return r.width > 0 && r.left >= cr.left - 1 && r.right <= cr.right + 1;
      }).map((h) => h.textContent.trim());
      const six = [...cal.querySelectorAll("*")].find((e) => e.children.length === 0 && /^6\s?a/.test(e.textContent.trim()));
      const sr = six?.getBoundingClientRect();
      const sixVisible = !!sr && rr && sr.top >= rr.top - 1 && sr.left >= cr.left;
      const adds = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Add session" && b.getBoundingClientRect().width > 0).length;
      return {
        calWidth: Math.round(cr.width),
        // the page's content column = the calendar's own wrapper (div.mt-6)
        contentWidth: Math.round(cal.parentElement?.getBoundingClientRect().width ?? main.getBoundingClientRect().width),
        visibleHeads,
        six: six?.textContent.trim(),
        sixVisible,
        regionScrollsX: region ? region.scrollWidth > region.clientWidth + 1 : false,
        adds,
      };
    });
    const noScroll = await noHScroll(page);
    const ev = await shot(page, "C20-events-1440");
    const ok = g.visibleHeads.length === 7 && noScroll && !g.regionScrollsX && g.sixVisible && g.adds === 1 && g.calWidth >= g.contentWidth * 0.95;
    record(
      "C20",
      `calendar ${g.calWidth}px of ${g.contentWidth}px content; day headers fully visible: ${g.visibleHeads.length}/7; page scrolls sideways: ${!noScroll}; grid scrolls sideways: ${g.regionScrollsX}; first hour label "${g.six}" visible: ${g.sixVisible}; visible "Add session" buttons: ${g.adds}`,
      ok ? "fixed" : "not fixed",
      ev
    );
  },

  async C21() {
    phoneShot("C21", "/today", "/plan");
    const check = (p) =>
      p.evaluate(() => {
        const out = [];
        for (const svg of document.querySelectorAll("main svg")) {
          const sr = svg.getBoundingClientRect();
          if (sr.width < 150 || sr.height < 80) continue; // icons
          const texts = [...svg.querySelectorAll("text")];
          const clipped = texts
            .filter((t) => {
              const r = t.getBoundingClientRect();
              return r.width > 0 && (r.left < sr.left - 1 || r.right > sr.right + 1 || r.top < sr.top - 1 || r.bottom > sr.bottom + 1);
            })
            .map((t) => t.textContent);
          const dots = [...svg.querySelectorAll("circle")].filter((c) => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && (r.top < sr.top - 1 || r.bottom > sr.bottom + 1);
          }).length;
          const nums = texts.map((t) => t.textContent.trim()).filter((s) => /^\d+(\.\d+)?$/.test(s)).map(Number);
          out.push({ w: Math.round(sr.width), labels: texts.length, clipped, dotsOutside: dots, yTicks: nums });
        }
        return out;
      });
    await go(page, "/today");
    const today = await check(page);
    const ev1 = await shot(page, "C21-today-1440");
    await go(page, "/plan");
    const plan = await check(page);
    const ev2 = await shot(page, "C21-plan-1440");
    const ctx = await context(375, 812);
    const p = await ctx.newPage();
    await go(p, "/today");
    const today375 = await check(p);
    await go(p, "/plan");
    const plan375 = await check(p);
    await ctx.close();
    const lowest = 5.5;
    const planTicks = plan.flatMap((c) => c.yTicks).filter((v) => v < 20);
    const yOk = planTicks.length > 0 && Math.min(...planTicks) <= lowest;
    const all = [...today, ...plan, ...today375, ...plan375];
    const clipped = all.flatMap((c) => c.clipped);
    const dots = all.reduce((a, c) => a + c.dotsOutside, 0);
    const ok = all.length > 0 && clipped.length === 0 && dots === 0 && yOk;
    record(
      "C21",
      `${all.length} charts checked (Today, Plan × 1440/375); clipped labels: ${clipped.length ? JSON.stringify(clipped) : "none"}; points outside the plot: ${dots}; /plan y ticks ${JSON.stringify([...new Set(planTicks)])} include lowest logged 5.50: ${yOk}`,
      ok ? "fixed" : "not fixed",
      `${ev1}, ${ev2}`
    );
  },

  async C22() {
    phoneShot("C22", "/today", "/events", "/schools/duke-m", "/outreach");
    const gaps = (p) =>
      p.evaluate(() => {
        // For every row of side-by-side columns in <main>, how far does one
        // column's content stop short of its neighbour's?
        const out = [];
        const contentBottom = (el) => {
          let b = el.getBoundingClientRect().top;
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (w.nextNode()) {
            const n = w.currentNode;
            if (!n.textContent.trim()) continue;
            const r = document.createRange();
            r.selectNodeContents(n);
            const rr = r.getBoundingClientRect();
            if (rr.height > 0) b = Math.max(b, rr.bottom);
          }
          for (const x of el.querySelectorAll("svg,canvas,img,button,input,textarea")) {
            const rr = x.getBoundingClientRect();
            if (rr.height > 0) b = Math.max(b, rr.bottom);
          }
          return b;
        };
        for (const c of document.querySelectorAll("main *")) {
          const kids = [...c.children].filter((k) => k.getBoundingClientRect().height > 40);
          if (kids.length < 2) continue;
          const rs = kids.map((k) => k.getBoundingClientRect());
          const sameRow = rs.every((r) => Math.abs(r.top - rs[0].top) < 4) && rs.some((r) => r.left > rs[0].right - 1);
          if (!sameRow || rs[0].width < 200) continue;
          // Empty space INSIDE a column's own box: a card stretched to its
          // neighbour's height with nothing in its lower half.
          kids.forEach((k, i) => {
            const empty = rs[i].bottom - contentBottom(k);
            if (empty > 200) out.push({ col: (k.innerText || "").trim().split("\n")[0].slice(0, 40), emptyPx: Math.round(empty) });
          });
        }
        return out;
      });
    const out = {};
    for (const path of ["/today", "/events", "/schools/duke-m"]) {
      await go(page, path);
      out[path] = await gaps(page);
    }
    await go(page, "/outreach");
    const ed = await page.evaluate(() => {
      const ta = [...document.querySelectorAll("main textarea")].find((t) => t.labels?.[0] && /Message/.test(t.labels[0].textContent));
      const main = document.querySelector("main .max-w-content") ?? document.querySelector("main");
      let card = ta;
      for (let i = 0; i < 6 && card?.parentElement; i++) card = card.parentElement;
      return {
        rows: ta?.rows ?? 0,
        taH: Math.round(ta?.getBoundingClientRect().height ?? 0),
        taW: Math.round(ta?.getBoundingClientRect().width ?? 0),
        mainW: Math.round(main.getBoundingClientRect().width),
      };
    });
    const ev = await shot(page, "C22-outreach-editor-1440");
    const n = Object.values(out).reduce((a, b) => a + b.length, 0);
    const ok = n === 0 && ed.taH >= 300 && ed.taW >= ed.mainW * 0.6;
    record(
      "C22",
      `side-by-side columns with >200px of empty space inside them: ${n ? JSON.stringify(out) : "none"} (Today, Events, school page at 1440); outreach message box ${ed.taW}×${ed.taH}px (${ed.rows} rows) in ${ed.mainW}px content`,
      ok ? "fixed" : "not fixed",
      ev
    );
  },

  async C23() {
    phoneShot("C23", "/settings", "/tournament-fit", "/matches");
    const ph = (p) => p.locator("main input, main textarea").evaluateAll((els) => els.map((e) => ({ label: e.labels?.[0]?.textContent?.trim()?.slice(0, 30) ?? e.getAttribute("aria-label"), ph: e.getAttribute("placeholder") })).filter((x) => x.ph));
    const out = {};
    await go(page, "/settings");
    out["/settings"] = await ph(page);
    await go(page, "/tournament-fit");
    out["/tournament-fit"] = await ph(page);
    await go(page, "/matches");
    out["/matches"] = await ph(page);
    // data-like = a bare number/money/city with no "e.g."/"Example" in front
    const dataLike = Object.entries(out).flatMap(([path, xs]) =>
      xs.filter((x) => !/^(e\.g\.|Example|Optional|Search|—|City, state|0\.0 to 4\.0|https?:\/\/|Jump)/i.test(x.ph) && /\d|Bethesda|MD\b|Smith|Alex/.test(x.ph)).map((x) => `${path} ${x.label}: "${x.ph}"`)
    );
    const ev = await shot(page, "C23-matches-1440");
    record(
      "C23",
      `placeholders: ${Object.entries(out).map(([k, v]) => `${k} ${v.map((x) => `${x.label}="${x.ph}"`).join(", ") || "none"}`).join("; ")}; data-like: ${dataLike.length ? dataLike.join(" | ") : "none"}`,
      dataLike.length === 0 ? "fixed" : "not fixed",
      ev
    );
  },

  async C24() {
    phoneShot("C24", "/plan");
    const banned = /Top \(drawn\)|#1 of the D1|combined score|Live data, your own account\./;
    const hits = [];
    for (const path of ["/plan", "/schools", "/schools/duke-m", "/today"]) {
      await go(page, path);
      const t = await bodyText(page);
      const m = t.match(banned);
      if (m) hits.push(`${path}: ${m[0]}`);
    }
    await go(page, "/plan");
    const h1s = await page.locator("h1").evaluateAll((hs) => hs.filter((h) => h.getBoundingClientRect().width > 0).map((h) => h.textContent.trim()));
    const ev = await shot(page, "C24-plan-1440");
    record("C24", `/plan visible H1s: ${JSON.stringify(h1s)}; banned phrases: ${hits.length ? hits.join(" | ") : "none"}`, h1s.length === 1 && hits.length === 0 ? "fixed" : "not fixed", ev);
  },

  async C25() {
    phoneShot("C25", "/schools");
    await go(page, "/schools");
    const rowsShown = async () => page.getByRole("button", { name: /^Show fit detail for / }).count();
    const header = async () => (await mainText(page)).match(/(Showing \d+ of \d+[^.]*|\d+ (?:men's|women's) programs)\./)?.[1];
    const h0 = await header();
    const r0 = await rowsShown();
    await page.getByRole("button", { name: /^Saved \d+/ }).click();
    await page.waitForTimeout(500);
    const h1 = await header();
    const r1 = await rowsShown();
    const ev1 = await shot(page, "C25-saved-filter-1440", false);
    await page.getByRole("button", { name: /^All \d+/ }).click();
    await page.waitForTimeout(300);
    const nOf = (h) => Number(h?.match(/Showing (\d+)/)?.[1] ?? h?.match(/^(\d+)/)?.[1]);
    const sliders = await page.evaluate(() => {
      const r = [...document.querySelectorAll('main input[type="range"]')];
      const panel = r[0]?.closest("section, div.rounded-xl") ?? null;
      // any other full-width bar drawn next to the range input (the old decorative track)
      const sib = r[0] ? [...r[0].parentElement.children].filter((c) => c !== r[0] && c.getBoundingClientRect().width > r[0].getBoundingClientRect().width * 0.8 && c.getBoundingClientRect().height <= 12).length : 0;
      return { ranges: r.length, decorative: sib, panel: !!panel };
    });
    const t = await mainText(page);
    const abbrev = /\bAcad\.|\bAcad\b/.test(t);
    const academics = count(t, /Academics|ACADEMICS/g);
    const top25 = await page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter((e) => e.children.length === 0 && e.textContent.trim() === "Top 25" && e.getBoundingClientRect().width > 0)
        .map((e) => {
          const cs = getComputedStyle(e);
          const interactive = !!e.closest("button, a, [role=button]");
          const pill = parseFloat(cs.borderTopWidth) > 0 || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent");
          return { interactive, pill };
        })
    );
    const ev2 = await shot(page, "C25-schools-1440");
    const badTop = top25.filter((x) => x.interactive || x.pill).length;
    const ok = nOf(h0) === r0 && nOf(h1) === r1 && r1 === 4 && sliders.ranges === 1 && sliders.decorative === 0 && !abbrev && academics >= 2 && badTop === 0;
    record(
      "C25",
      `header "${h0}" over ${r0} rows; Saved filter → "${h1}" over ${r1} rows; range inputs ${sliders.ranges}, decorative bars beside it ${sliders.decorative}; "Acad." ${abbrev ? "PRESENT" : "absent"}, "Academics" ×${academics}; "Top 25" labels ${top25.length}, styled as control/pill ${badTop}`,
      ok ? "fixed" : "not fixed",
      `${ev1}, ${ev2}`
    );
  },

  async C26() {
    phoneShot("C26", "/today", "/settings");
    await go(page, "/today");
    const side = await page.evaluate(() => {
      const aside = document.querySelector("aside") ?? document.querySelector("nav");
      const links = [...aside.querySelectorAll("a")].map((a) => `${a.textContent.trim()}→${a.getAttribute("href")}`);
      const toggles = [...aside.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") || b.textContent).trim()).filter((s) => /dark|light|theme|appearance/i.test(s));
      return { links, toggles };
    });
    const tc = side.links.some((l) => /Tournament checker→\/tournament-fit/.test(l));
    // account menu must not carry a theme toggle either
    await page.getByRole("button", { name: "Account menu" }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    const menuToggles = await page.locator('[role="menu"], [role="dialog"]').evaluateAll((ms) =>
      ms.flatMap((m) => [...m.querySelectorAll("button,[role=menuitem],[role=switch]")].map((b) => (b.getAttribute("aria-label") || b.textContent).trim()).filter((s) => /dark|light mode|theme/i.test(s)))
    );
    await page.keyboard.press("Escape");
    await go(page, "/settings");
    const appearance = await page.getByRole("button", { name: "Dark", exact: true }).count();
    const ev = await shot(page, "C26-settings-1440");
    const plural = [];
    for (const path of ["/today", "/plan", "/events", "/matches", "/schools", "/outreach", "/today/check-ins", "/family", "/settings"]) {
      await go(page, path);
      const t = await bodyText(page);
      const m = t.match(/\b1 (matches|results|schools|programs|sessions|check-ins|targets|days|weeks|players|steps|members|emails|replies|parents|seats)\b/);
      if (m) plural.push(`${path}: "${m[0]}"`);
    }
    const ok = tc && side.toggles.length === 0 && menuToggles.length === 0 && appearance > 0 && plural.length === 0;
    record(
      "C26",
      `sidebar has Tournament checker → /tournament-fit: ${tc}; theme toggles in sidebar ${side.toggles.length}, in account menu ${menuToggles.length}; Settings → Appearance has Dark: ${appearance > 0}; "1 <plural>" hits on 9 screens: ${plural.length ? plural.join(" | ") : "none"}`,
      ok ? "fixed" : "not fixed",
      ev
    );
  },

  async C27() {
    phoneShot("C27", "/matches");
    await go(page, "/matches");
    const f = await page.locator("main form").first().evaluate((form) => {
      const fields = [...form.querySelectorAll("input:not([type=hidden]), select, textarea")];
      const unlabeled = fields
        .filter((e) => !(e.labels?.length && e.labels[0].textContent.trim()) && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby") && !(e.type === "radio" && e.closest("fieldset")?.querySelector("legend")))
        .map((e) => `${e.tagName.toLowerCase()}[${e.type || ""}] ${e.id}`);
      const short = fields.filter((e) => e.type !== "radio" && e.getBoundingClientRect().height < 44).map((e) => `${e.id} ${Math.round(e.getBoundingClientRect().height)}px`);
      return { n: fields.length, unlabeled, short };
    });
    const ev = await shot(page, "C27-matches-1440");
    record(
      "C27",
      `${f.n} fields, unlabeled: ${f.unlabeled.length ? f.unlabeled.join(", ") : "none"}; under 44px tall: ${f.short.length ? f.short.join(", ") : "none"}`,
      f.unlabeled.length === 0 ? "fixed" : "not fixed",
      ev
    );
  },

  async C28() {
    phoneShot("C28", "/outreach");
    await go(page, "/outreach");
    const g = await page.evaluate(() => {
      const main = document.querySelector("main");
      const heads = [...main.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^(RESEARCHING|EMAILED|REPLIED|CALL \/ VISIT|OFFER|COMMITTED|Researching|Emailed|Replied|Call \/ visit|Offer|Committed)$/.test(e.textContent.trim()) && getComputedStyle(e).textTransform !== "none" || false);
      // column headers: the uppercase-styled labels
      const cols = [...main.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^(Researching|Emailed|Replied|Call \/ visit|Offer|Committed)$/i.test(e.textContent.trim()) && /uppercase/.test(getComputedStyle(e).textTransform));
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        let a = el.parentElement;
        while (a && a !== document.body) {
          const cs = getComputedStyle(a);
          if (cs.overflowX !== "visible") {
            const ar = a.getBoundingClientRect();
            if (r.left < ar.left - 1 || r.right > ar.right + 1) return false;
          }
          a = a.parentElement;
        }
        return r.right <= document.documentElement.clientWidth + 1;
      };
      const offer = cols.find((c) => /^offer$/i.test(c.textContent.trim()));
      const committed = cols.find((c) => /^committed$/i.test(c.textContent.trim()));
      const board = offer?.closest("[class*=overflow]");
      const cards = [...main.querySelectorAll("button")].filter((b) => /^Remind me in/.test(b.textContent.trim())).map((b) => b.closest("li, article, div.rounded-xl, div.rounded-lg")?.innerText ?? "");
      const chips = cards.filter((t) => /Out of range|\bReach\b|\bLikely\b|\bTarget\b/.test(t)).length;
      const btn = (name) => [...main.querySelectorAll("button, a")].find((b) => b.textContent.trim() === name);
      const gm = btn("Open in Gmail");
      const desc = gm?.getAttribute("aria-describedby");
      const descText = desc ? document.getElementById(desc)?.textContent ?? "" : "";
      // The action row's own buttons: for each name, the one nearest Gmail
      // (there is a second "Copy", for the staff search phrase, above it).
      const gr = gm?.getBoundingClientRect();
      const nearest = (name) =>
        [...main.querySelectorAll("button, a")]
          .filter((b) => b.textContent.trim() === name && b.getBoundingClientRect().width > 0)
          .sort((a, b) => Math.abs(a.getBoundingClientRect().top - (gr?.top ?? 0)) - Math.abs(b.getBoundingClientRect().top - (gr?.top ?? 0)))[0];
      const tops = ["Open in Gmail", "Copy", "Mark sent", "Mark replied"].map((n) => {
        const r = nearest(n)?.getBoundingClientRect();
        return r ? Math.round(r.top + r.height / 2) : null;
      });
      return {
        cols: cols.length,
        offerVisible: offer ? visible(offer) : false,
        committedVisible: committed ? visible(committed) : false,
        boardScrolls: board ? board.scrollWidth > board.clientWidth + 1 : false,
        cards: cards.length,
        chips,
        gmailDisabled: gm ? gm.disabled || gm.getAttribute("aria-disabled") === "true" : null,
        gmailWhy: descText || [...main.querySelectorAll("p")].map((p) => p.textContent).find((t) => /to open Gmail/i.test(t)) || "",
        centers: tops,
      };
    });
    const ev = await shot(page, "C28-outreach-1440");
    const aligned = g.centers.every((c) => c !== null && Math.abs(c - g.centers[0]) <= 3);
    const ok = g.offerVisible && g.committedVisible && !g.boardScrolls && g.chips === 0 && g.gmailDisabled && /Gmail/.test(g.gmailWhy) && aligned;
    record(
      "C28",
      `at 1440: ${g.cols} column headers, Offer fully visible ${g.offerVisible}, Committed ${g.committedVisible}, board scrolls sideways ${g.boardScrolls}; fit-band chips on ${g.chips}/${g.cards} cards; Gmail disabled ${g.gmailDisabled} with reason "${g.gmailWhy.trim().slice(0, 70)}"; action row centres ${JSON.stringify(g.centers)} aligned ${aligned}`,
      ok ? "fixed" : "not fixed",
      ev
    );
  },

  async C30() {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ });
    watch(ctx);
    const p = await ctx.newPage();
    const out = {};
    for (const path of ["/login", "/signup"]) {
      await go(p, path);
      out[path] = await p.getByRole("button", { name: /Continue with Google/ }).count();
    }
    const ev = await shot(p, "C30-signup-1440");
    await ctx.close();
    const envOn = /NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true/.test(readFileSync(".env.local", "utf8"));
    const evidenceFile = existsSync(join(EVID, "C30-google.md"));
    record(
      "C30",
      `.env.local sets NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=${envOn}; "Continue with Google" buttons: /login ${out["/login"]}, /signup ${out["/signup"]} (onboarding save step and the new-user → /auth/complete path verified by reading the code — see the notes under the table). End-to-end sign-in not run: staging has no Google provider.`,
      "blocked on a dashboard step",
      `${ev}; ${evidenceFile ? "C30-google.md" : "(C30-google.md missing)"}`
    );
  },
};

/* ------------------------------------------------------------------- run */

const order = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9_C19", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18", "C20", "C21", "C22", "C23", "C24", "C25", "C26", "C27", "C28", "C30"];
for (const id of order) {
  if (ONLY.size && !ONLY.has(id) && !(id === "C9_C19" && (ONLY.has("C9") || ONLY.has("C19")))) continue;
  try {
    await ITEMS[id]();
  } catch (e) {
    const ev = await shot(page, `${id}-crash`, false);
    for (const one of id.split("_")) record(one, `script error: ${String(e).split("\n")[0].slice(0, 200)}`, "not fixed", ev);
  }
}
// C6 is recorded last so it covers native dialogs from the WHOLE sweep.
if (ITEMS._c6row) {
  const r = ITEMS._c6row;
  const ok = r.ok && nativeDialogs.length === 0;
  record("C6", r.after.replace(/native dialogs so far: \d+/, `native dialogs in the whole sweep: ${nativeDialogs.length}${nativeDialogs.length ? " " + nativeDialogs.join("; ") : ""}`), ok ? "fixed" : "not fixed", r.ev);
}

// C29: the phone sweep (site-audit.mjs narrow, 320 + 375) for the sweep
// player (s), a Family-plan parent (f) and a free parent (k), before and
// after this branch's phone fixes. Counts come from the harness's own
// results.jsonl files; nothing here re-measures.
function phoneCounts(dir) {
  const out = { pages: 0, signInErrors: 0, loadErrors: 0, hScroll: 0, clipped: 0, underBar: 0, tapPages: 0, taps: 0, junk: 0, consoleErrors: 0 };
  let found = false;
  for (const p of ["s", "f", "k"]) {
    const f = join(dir, p, "results.jsonl");
    if (!existsSync(f)) continue;
    found = true;
    for (const line of readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      if (r.signInError) { out.signInErrors++; continue; }
      out.pages++;
      if (r.error) out.loadErrors++;
      if (r.hScroll) out.hScroll++;
      if (r.clipped?.length) out.clipped++;
      if (r.underBar?.length) out.underBar++;
      if (r.smallTapCount) { out.tapPages++; out.taps += r.smallTapCount; }
      if (r.junk?.length) out.junk++;
      out.consoleErrors += (r.consoleErrors ?? []).filter((e) => !/status of 404/.test(e)).length;
    }
  }
  return found ? out : null;
}
{
  const before = phoneCounts(join(EVID, "phone-before"));
  const after = phoneCounts(join(EVID, "phone"));
  if (before || after) {
    const fmt = (c) => c ? `${c.pages} page loads: sideways scroll ${c.hScroll}, clipped past the edge ${c.clipped}, content under the tab bar ${c.underBar}, pages with <44px taps ${c.tapPages} (${c.taps} targets), rendered junk ${c.junk}, load errors ${c.loadErrors}, console errors ${c.consoleErrors}, sign-in failures ${c.signInErrors}` : "not run";
    const clean = after && after.hScroll === 0 && after.clipped === 0 && after.underBar === 0 && after.loadErrors === 0 && after.signInErrors === 0;
    record(
      "C29",
      `BEFORE ${fmt(before)}. AFTER ${fmt(after)}.`,
      clean ? (after.taps === 0 ? "fixed" : "partly") : "not fixed",
      "phone-before/{s,f,k}/results.jsonl, phone/{s,f,k}/results.jsonl + shots/ (node scripts/audit-summary.mjs with AUDIT_OUT)"
    );
  }
}

// Phone screenshots (375) of every route each item looked at.
// One shot per route, shared by every item that looked at it.
const phoneShots = new Map();
for (const [id, routes] of Object.entries(phoneRoutes)) {
  const names = [];
  for (const r of routes) {
    if (!phoneShots.has(r)) {
      await go(ppage, r);
      phoneShots.set(r, await shot(ppage, `375${r.replace(/\//g, "_")}`));
    }
    names.push(phoneShots.get(r));
  }
  const row = rows.find((x) => x.id === id || (id === "C9" && x.id === "C9"));
  if (row) row.evidence += `; 375: ${names.join(", ")}`;
}

await browser.close();

/* -------------------------------------------------------------- SWEEP.md */

const byId = (id) => Number(id.slice(1));
rows.sort((a, b) => byId(a.id) - byId(b.id));
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = [
  "| Item | Reported | After (what the script observed) | Status | Evidence |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${esc(r.reported)} | ${esc(r.after)} | **${r.status}** | ${esc(r.evidence)} |`),
].join("\n");
const tally = rows.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
const out = join(EVID, process.env.SWEEP_OUT ?? "SWEEP.md");
const NOTES = `
## Notes

**C30, the code path for a new Google user** (read, not run — staging has no
Google provider; C30-google.md lists the dashboard steps). \`/auth/callback\`
renders \`components/auth/oauth-callback.tsx\`: a provider error goes to
\`/login?authError=<code>\` (a code /login turns into its own sentence, never
the provider's text); otherwise it exchanges the code, and with a session but
no \`profiles\` row (\`hasSeededProfile()\`, a single-row read by id) it
\`router.replace\`s to \`/auth/complete\` (\`OAUTH_COMPLETE_PATH\`), carrying a
safe \`?next=\`. \`components/auth/complete-oauth-signup.tsx\` bounces anyone
without a session to /login and anyone WITH a profile straight in, prefills
the Google name, carries the /onboarding diagnostic's answers (a parent's
answers never put the player's birth year on the parent), and creates the
profile through the same \`ensureSupabaseProfile\` path as email signup, so
the under-13 consent rule and the family join apply unchanged. The button
itself (\`GoogleButton\`, components/auth/auth-card.tsx) renders only when
\`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"\`; it is used on /login, /signup
and the diagnostic's save step (components/seeded/onboarding/diagnostic/
diagnostic-save.tsx, both branches).

**Staging rows this sweep writes, as the persona, through the app's UI:**
one tournament_entries row per run ("Sweep C3 <HHMM>", kept: the app has no
delete for it); one utr_entries row at 5.95 dated today per run; today's
daily check-in (upserted); a training session and a match result, both
deleted again through the UI (the result via Delete → Undo → Delete); a plan
goal set to 9.00 and reset to the estimate; a target added and removed.
`;
writeFileSync(
  out,
  `<!-- generated by scripts/sweep-c.mjs at ${new Date().toISOString()} against ${BASE}, browser in ${TZ} -->\n\n# PR C production sweep (C1–C30)\n\nScreens at 1440 (assertions) and 375 (evidence shots); C18 runs at 320; C29 at 320 + 375.\n\n${table}\n\nTally: ${JSON.stringify(tally)}\nNative dialogs: ${nativeDialogs.length}\nWrites seen: ${writes.length} (${writes.filter((w) => w.status >= 400).length} failed${writes.filter((w) => w.status >= 400).length ? ": " + writes.filter((w) => w.status >= 400).map((w) => `${w.method} ${w.url.replace(/^https?:\/\/[^/]+/, "")} ${w.status}`).join(", ") : ""})\n${NOTES}`
);
console.log(`\n${JSON.stringify(tally)} -> ${out}`);
