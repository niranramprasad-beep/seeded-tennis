// End-to-end journeys on a PRODUCTION build against STAGING, as the
// persona accounts (docs/FINAL_PASS_REPORT.md). Each flow prints what it
// saw; assertions that fail print FAIL and the flow continues, so one run
// shows everything that is wrong.
//
//   node scripts/flows.mjs                 # all flows
//   node scripts/flows.mjs consent budget  # just those
//
// Flows that write (budget, consent, delete) leave staging changed on
// purpose — the report records what to re-seed. Checkout stops at Whop's
// page: it never pays.

import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "";
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3100";
const OUT = join(HOME, "seeded-evidence/overnight/flows");
mkdirSync(OUT, { recursive: true });
const PASSWORD = readFileSync(join(HOME, "seeded-evidence/overnight/.persona-pass"), "utf8").trim();
const CHROME = join(HOME, "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const ONLY = new Set(process.argv.slice(2));

const results = [];
const check = (flow, what, ok, detail = "") => {
  results.push({ flow, what, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} [${flow}] ${what}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ executablePath: CHROME });

async function session(who, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', `fake-persona-${who}@example.com`);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const text = (page) => page.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
}

const FLOWS = {
  async login() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', "fake-persona-a@example.com");
    await page.fill('input[type="password"]', "definitely-not-the-password");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    const t = await text(page);
    check("login", "wrong password stays on /login", new URL(page.url()).pathname === "/login");
    check("login", "wrong password shows a human sentence", /incorrect|match|wrong|invalid/i.test(t) && !/AuthApiError|400|undefined/.test(t), t.slice(0, 160).replace(/\s+/g, " "));
    await shot(page, "login-wrong-password");
    // already signed in, visiting /login
    const s = await session("a");
    await go(s.page, "/login");
    check("login", "a signed-in player visiting /login is sent on", new URL(s.page.url()).pathname !== "/login", s.page.url());
    await s.ctx.close();
    await ctx.close();
  },

  async consent() {
    // (g) pending: gate visible, settings reachable
    let s = await session("g");
    await go(s.page, "/today");
    let t = await text(s.page);
    check("consent", "under-13 pending sees the consent gate on /today", /parent needs to|consent|approve/i.test(t), t.slice(0, 140).replace(/\s+/g, " "));
    await shot(s.page, "g-pending-today");
    await go(s.page, "/settings");
    t = await text(s.page);
    check("consent", "under-13 pending can reach Settings (export/delete)", /Download everything/.test(t) && /Delete account/.test(t));
    await s.ctx.close();
    // (a) sibling player must NOT be offered the consent button
    s = await session("a");
    await go(s.page, "/today");
    t = await text(s.page);
    check("consent", "a sibling PLAYER is not offered 'give consent'", !/give consent/i.test(t), t.match(/.{0,60}give consent.{0,20}/i)?.[0] ?? "");
    await s.ctx.close();
    // (f) parent consents through the UI
    s = await session("f");
    await go(s.page, "/family");
    const btn = s.page.getByRole("button", { name: /give consent/i });
    check("consent", "parent sees the consent button for Riley", (await btn.count()) > 0);
    if (await btn.count()) {
      await btn.first().click();
      await s.page.waitForTimeout(3000);
      t = await text(s.page);
      check("consent", "after consent, the waiting card is gone", !/still can.t use Seeded/.test(t));
      await shot(s.page, "f-after-consent");
    }
    await s.ctx.close();
    // (g) now active: no gate (they go to onboarding, being un-onboarded)
    s = await session("g");
    await go(s.page, "/today");
    t = await text(s.page);
    check("consent", "after consent, (g) is no longer gated", !/a parent needs to say yes/i.test(t), new URL(s.page.url()).pathname);
    await shot(s.page, "g-after-consent");
    await s.ctx.close();
  },

  async budget() {
    const s = await session("f");
    await go(s.page, "/family/budget");
    await s.page.getByRole("button", { name: /^Add expense$/ }).first().click();
    await s.page.waitForTimeout(500);
    await s.page.fill('input[placeholder="Duke Tennis Camp"]', "Restring (flow test)");
    await s.page.fill('input[placeholder="380"]', "42");
    await s.page.getByRole("button", { name: /^Add expense$/ }).last().click();
    await s.page.waitForTimeout(2500);
    const t = await text(s.page);
    check("budget", "parent can add an expense and sees it listed", /Restring \(flow test\)/.test(t));
    check("budget", "spent total moved by $42 ($1,280 -> $1,322)", /\$1,322 spent/.test(t), t.match(/\$[\d,]+ spent/)?.[0] ?? "");
    await shot(s.page, "f-budget-after-add");
    await s.ctx.close();
  },

  async export() {
    const s = await session("a");
    await go(s.page, "/settings");
    await s.page.getByRole("button", { name: /^Privacy \+ data$/ }).click().catch(() => {});
    await s.page.waitForTimeout(500);
    const [dl] = await Promise.all([
      s.page.waitForEvent("download", { timeout: 20000 }),
      s.page.getByRole("button", { name: /^Download$/ }).first().click(),
    ]);
    const path = join(OUT, "a-export.json");
    await dl.saveAs(path);
    const json = JSON.parse(readFileSync(path, "utf8"));
    const ids = new Set();
    for (const [table, rows] of Object.entries(json.data)) {
      if (!Array.isArray(rows)) continue;
      for (const r of rows) if (r.user_id) ids.add(r.user_id);
    }
    check("export", "JSON export holds only (a)'s own user-keyed rows", [...ids].every((id) => id === json.account_id), [...ids].join(","));
    check("export", "export includes (a)'s 5 UTR entries", (json.data.utr_entries ?? []).length === 5, String((json.data.utr_entries ?? []).length));
    check("export", "family budget included (documented)", Array.isArray(json.data.season_budgets) && json.data.season_budgets.length === 1);
    const [csv] = await Promise.all([
      s.page.waitForEvent("download", { timeout: 20000 }),
      s.page.getByRole("button", { name: /^Download CSV$/ }).first().click(),
    ]);
    await csv.saveAs(join(OUT, "a-export.csv"));
    const c = readFileSync(join(OUT, "a-export.csv"), "utf8");
    check("export", "CSV has content and no sibling/parent rows", c.length > 100 && !/Riley|Jordan/.test(c));
    await s.ctx.close();
  },

  async ratelimit() {
    // data_export allows 3/hour (028/034): the 4th must be a friendly sentence.
    const s = await session("b");
    await go(s.page, "/settings");
    await s.page.getByRole("button", { name: /^Privacy \+ data$/ }).click().catch(() => {});
    for (let i = 0; i < 4; i++) {
      await s.page.getByRole("button", { name: /^Download$/ }).first().click();
      await s.page.waitForTimeout(2500);
    }
    const t = await text(s.page);
    check("ratelimit", "4th export shows a friendly limit message", /try again|too many|limit/i.test(t) && !/53400|P0001|retry_after/.test(t), t.match(/.{0,80}(try again|too many|limit).{0,60}/i)?.[0] ?? "");
    await shot(s.page, "b-ratelimit");
    await s.ctx.close();
  },

  async checkout() {
    const s = await session("a");
    for (const interval of ["Monthly", "Yearly"]) {
      for (const tier of ["Player", "Family"]) {
        await go(s.page, "/pricing");
        await s.page.getByRole("button", { name: new RegExp(`^${interval}`, "i") }).first().click().catch(() => {});
        const req = s.page.waitForResponse((r) => r.url().includes("/api/whop/checkout"), { timeout: 20000 }).catch(() => null);
        const nav = s.page.waitForURL((u) => !u.href.startsWith(BASE), { timeout: 20000 }).catch(() => null);
        await s.page.getByRole("button", { name: new RegExp(`(Get|Choose|Start|Upgrade).*${tier}`, "i") }).first().click().catch(async () => {
          await s.page.locator(`text=/${tier}/`).first().click();
        });
        const resp = await req;
        await nav;
        const host = new URL(s.page.url()).host;
        let body = null;
        try { body = await resp?.json(); } catch {}
        check("checkout", `${interval} ${tier}: leaves for Whop's checkout (stopped there)`, /whop\.com$/.test(host), `${resp?.status() ?? "no request"} -> ${host}`);
        if (body?.url) writeFileSync(join(OUT, `checkout-${interval}-${tier}.txt`), new URL(body.url).pathname);
      }
    }
    await s.ctx.close();
  },

  async checkoutSuccess() {
    const s = await session("a");
    await go(s.page, "/today?checkout=success");
    await s.page.waitForTimeout(6000);
    const t = await s.page.evaluate(() => document.body.innerText);
    check("checkoutSuccess", "?checkout=success says something honest (confirming / couldn't confirm)", /confirm/i.test(t), t.match(/.{0,80}confirm.{0,80}/i)?.[0] ?? "");
    await shot(s.page, "a-checkout-success");
    await s.ctx.close();
  },

  async deleteAccount() {
    const s = await session("j");
    await go(s.page, "/settings");
    await s.page.getByRole("button", { name: /^Privacy \+ data$/ }).click().catch(() => {});
    await s.page.getByRole("button", { name: /^Delete account$/ }).first().click();
    await s.page.waitForTimeout(400);
    await s.page.locator('[aria-labelledby="delete-account-title"] input[type="checkbox"]').check();
    await s.page.fill('[aria-labelledby="delete-account-title"] input[placeholder="DELETE"]', "DELETE");
    await s.page.getByRole("button", { name: /^Delete everything$/ }).click();
    await s.page.waitForURL((u) => u.pathname === "/", { timeout: 20000 }).catch(() => {});
    check("delete", "deleting lands on the homepage, signed out", new URL(s.page.url()).pathname === "/", s.page.url());
    await s.ctx.close();
    // signing in again must fail
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[type="email"]', "fake-persona-j@example.com");
    await p.fill('input[type="password"]', PASSWORD);
    await p.click('button[type="submit"]');
    await p.waitForTimeout(3000);
    check("delete", "the deleted account can no longer sign in", new URL(p.url()).pathname === "/login");
    await ctx.close();
  },
};

for (const [name, fn] of Object.entries(FLOWS)) {
  if (ONLY.size && !ONLY.has(name)) continue;
  try {
    await fn();
  } catch (e) {
    check(name, "flow crashed", false, String(e).slice(0, 200));
  }
}
await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
