import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import {
  GA_EXCLUDED_PATH_PREFIXES,
  GA_INTERNAL_FLAG_KEY,
  accountAllowsGa,
  browserAllowsGa,
  gaAccountState,
  gaConfigParams,
  gaPageLocation,
  gaPagePath,
  gaPageViewParams,
  gaReferrer,
  internalParamAction,
  isGaExcludedPath,
  shouldLoadGa,
  stripInternalParam,
  syncInternalFlag,
  type GaAccountState,
  type GaConsentStatus,
} from "./ga-privacy";
import { purchaseEventBody } from "./ga4-server";
import { GaRuntime, type GaWindow } from "./ga-runtime";

// Guards for Google Analytics (audit A-201 and the GA privacy change). Fails
// the build if:
//   - anything GA is given as a page (page_path, page_location,
//     page_referrer) can carry a query string or hash;
//   - GA can load or fire on a sign-in / sign-up page (/auth/*, /login,
//     /signup, /parent-signup, /reset-password), or an auth page is added
//     under app/ without being excluded;
//   - GA can load or fire for a signed-in account that needed a parent's
//     consent, or before the account state is known;
//   - the automation (navigator.webdriver) or internal-browser skip goes;
//   - the server purchase event carries anything but plan, price, currency;
//   - components/shared/google-analytics.tsx stops routing through the
//     functions tested here.

const ROOT = join(__dirname, "..");
const ORIGIN = "https://seededtennis.com";

// The homepage calculator's real shape, plus hashes and odd inputs.
const NASTY_PATHS = [
  "/",
  "/?utr=9.5&gpa=3.9&grad=2028&gender=girls",
  "/schools?utr=11#fit",
  "/auth/callback?code=abc&next=%2Ftoday",
  "/today#section",
  "?utr=9",
  "#x",
  "",
  "schools?a=1",
  "/a?b?c#d#e",
];

function hasQueryOrHash(s: string | undefined): boolean {
  return s !== undefined && /[?#]/.test(s);
}

const ALLOWED_ACCOUNT: GaAccountState = { kind: "signed-out" };
const BASE = {
  pathname: "/schools",
  account: ALLOWED_ACCOUNT,
  webdriver: false as boolean | undefined,
  internalFlag: false as boolean | undefined,
};

describe("GA receives a path and nothing after it", () => {
  it.each(NASTY_PATHS)("gaPagePath(%j) has no query or hash", (p) => {
    const out = gaPagePath(p);
    expect(hasQueryOrHash(out)).toBe(false);
    expect(out.startsWith("/")).toBe(true);
  });

  it("keeps the path itself", () => {
    expect(gaPagePath("/?utr=9.5&gpa=3.9")).toBe("/");
    expect(gaPagePath("/schools/stanford?x=1#y")).toBe("/schools/stanford");
    expect(gaPagePath("/today")).toBe("/today");
    expect(gaPagePath(null)).toBe("/");
  });

  it.each(NASTY_PATHS)("page_view params for %j carry no query or hash", (p) => {
    const params = gaPageViewParams(ORIGIN, p, gaReferrer(`${ORIGIN}/?utr=12&gpa=4`));
    expect(hasQueryOrHash(params.page_path)).toBe(false);
    expect(hasQueryOrHash(params.page_location)).toBe(false);
    expect(hasQueryOrHash(params.page_referrer)).toBe(false);
    expect(params.page_location).toBe(`${ORIGIN}${params.page_path}`);
    expect(Object.keys(params).sort()).toEqual(["page_location", "page_path", "page_referrer"]);
  });

  it("page_location ignores anything but the origin it is given", () => {
    expect(gaPageLocation(`${ORIGIN}/x?utr=9#h`, "/schools?utr=9")).toBe(`${ORIGIN}/schools`);
  });

  it("page_referrer is origin + path, or nothing", () => {
    expect(gaReferrer("https://www.google.com/search?q=my+utr+is+9")).toBe("https://www.google.com/search");
    expect(gaReferrer(`${ORIGIN}/?utr=9.5&gender=girls#top`)).toBe(`${ORIGIN}/`);
    // No usable referrer is an explicit "" — always sent, so gtag never
    // falls back to the raw document.referrer.
    expect(gaReferrer("")).toBe("");
    expect(gaReferrer(null)).toBe("");
    expect(gaReferrer("not a url")).toBe("");
    expect(gaReferrer("android-app://com.google/?q=1")).toBe("");
    expect(gaPageViewParams(ORIGIN, "/x", "android-app://com.google/?q=1")).toHaveProperty("page_referrer", "");
    expect(gaConfigParams(`${ORIGIN}/x`, "")).toHaveProperty("page_referrer", "");
    // A raw referrer passed straight in is still stripped.
    expect(gaPageViewParams(ORIGIN, "/x", `${ORIGIN}/?utr=9#h`).page_referrer).toBe(`${ORIGIN}/`);
    expect(gaConfigParams(`${ORIGIN}/x`, `${ORIGIN}/?utr=9#h`).page_referrer).toBe(`${ORIGIN}/`);
  });

  it("the gtag config never sends its own page_view and never falls back to document.location", () => {
    const cfg = gaConfigParams(gaPageLocation(ORIGIN, "/?utr=9"), gaReferrer(`${ORIGIN}/x?gpa=4`));
    expect(cfg.send_page_view).toBe(false);
    expect(cfg.page_location).toBe(`${ORIGIN}/`);
    expect(hasQueryOrHash(cfg.page_referrer)).toBe(false);
    expect(cfg.allow_google_signals).toBe(false);
    expect(cfg.allow_ad_personalization_signals).toBe(false);
  });
});

describe("never on a sign-in or sign-up page (/auth/*, /login, /signup, /parent-signup, /reset-password)", () => {
  it.each([
    "/auth",
    "/auth/",
    "/auth/callback",
    "/auth/complete",
    "/auth/verified?x=1",
    "/AUTH/Callback",
    // Final-check A7: these four loaded gtag.js and sent a page_view.
    "/login",
    "/login/",
    "/login?next=%2Ftoday",
    "/LOGIN",
    "/signup",
    "/signup#step-2",
    "/Signup/",
    "/parent-signup",
    "/parent-signup?code=ABC",
    "/reset-password",
    "/reset-password#access_token=x",
    "/parent-login",
  ])("%s is excluded even when everything else allows it", (pathname) => {
    expect(isGaExcludedPath(pathname)).toBe(true);
    expect(shouldLoadGa({ ...BASE, pathname })).toBe(false);
    expect(shouldLoadGa({ ...BASE, pathname, account: { kind: "signed-in", consentStatus: "not_required", birthYearKnown: true } })).toBe(false);
  });

  it.each(["/", "/authors", "/schools", "/how-it-works", "/loginx", "/signups", "/parents", "/pricing", "/onboarding", "/privacy"])(
    "%s is not a sign-in page",
    (pathname) => {
      expect(isGaExcludedPath(pathname)).toBe(false);
      expect(shouldLoadGa({ ...BASE, pathname })).toBe(true);
    }
  );

  it("every excluded prefix is a real route under app/ (no dead entries)", () => {
    const routes = new Set(appPageRoutes().map((r) => r.route.toLowerCase()));
    for (const prefix of GA_EXCLUDED_PATH_PREFIXES) {
      const hit = [...routes].some((r) => r === prefix || r.startsWith(`${prefix}/`));
      expect(hit, `${prefix} has no page under app/`).toBe(true);
    }
  });

  // The guard: a new sign-in / sign-up / password / auth page cannot be added
  // under app/ without GA being excluded from it. Walks every page.tsx (and
  // route.ts) and looks at each URL segment.
  it("covers every auth page route under app/", () => {
    const AUTH_SEGMENT =
      /^(auth|login|log-in|signin|sign-in|signup|sign-up|register|parent-login|parent-signup|reset-password|forgot-password|password|verify|verified|callback|logout|sign-out|signout|confirm)$/i;
    const authRoutes = appPageRoutes().filter((r) =>
      r.route
        .split("/")
        .filter(Boolean)
        .some((seg) => AUTH_SEGMENT.test(seg) || /(login|signup|sign-in|sign-up|password)/i.test(seg))
    );
    // The walk itself must find the pages this test exists for.
    const found = authRoutes.map((r) => r.route);
    for (const expected of ["/login", "/signup", "/parent-signup", "/reset-password", "/auth/callback", "/auth/complete", "/auth/verified"]) {
      expect(found).toContain(expected);
    }
    for (const r of authRoutes) {
      expect(isGaExcludedPath(r.route), `${r.file} (${r.route}) is an auth page GA is not excluded from`).toBe(true);
    }
  });
});

/** Every page/route file under app/, with the URL it serves. Route groups
 * "(x)" drop out of the URL; private folders "_x" and api/ are skipped
 * (api routes never render GA). */
function appPageRoutes(): Array<{ file: string; route: string }> {
  const appDir = join(ROOT, "app");
  const out: Array<{ file: string; route: string }> = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_") || (segments.length === 0 && entry.name === "api")) continue;
        const isGroup = /^\(.*\)$/.test(entry.name);
        walk(join(dir, entry.name), isGroup ? segments : [...segments, entry.name]);
      } else if (/^(page|route)\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
        out.push({ file: join(dir, entry.name).slice(ROOT.length + 1), route: `/${segments.join("/")}` });
      }
    }
  };
  walk(appDir, []);
  return out;
}

describe("never for an account that needed a parent's consent, never before we know", () => {
  const blocked: GaConsentStatus[] = ["pending", "granted", "unknown", undefined];
  it.each(blocked)("signed in with consent %s: no", (consentStatus) => {
    const account: GaAccountState = { kind: "signed-in", consentStatus, birthYearKnown: true };
    expect(accountAllowsGa(account)).toBe(false);
    expect(shouldLoadGa({ ...BASE, account })).toBe(false);
  });

  it("signed in with consent not_required and a known birth year: yes", () => {
    const account: GaAccountState = { kind: "signed-in", consentStatus: "not_required", birthYearKnown: true };
    expect(shouldLoadGa({ ...BASE, account })).toBe(true);
  });

  it.each([false, undefined])("not_required but birth year known=%s (pre-030 account, age unknowable): no", (birthYearKnown) => {
    const account: GaAccountState = { kind: "signed-in", consentStatus: "not_required", birthYearKnown };
    expect(shouldLoadGa({ ...BASE, account })).toBe(false);
  });

  it("gaAccountState: nothing known yet is unknown; signed in with no answer is a no", () => {
    const facts = {
      hydrated: true,
      connectionError: null as string | null,
      isAuthed: true,
      userId: "u1" as string | null,
      consent: { status: "not_required" as GaConsentStatus, birthYearKnown: true } as
        | { status: GaConsentStatus; birthYearKnown: boolean }
        | undefined,
      consentError: undefined as unknown,
    };
    expect(gaAccountState({ ...facts, hydrated: false })).toEqual({ kind: "unknown" });
    expect(gaAccountState({ ...facts, hydrated: false, isAuthed: false })).toEqual({ kind: "unknown" });
    expect(gaAccountState({ ...facts, connectionError: "down", isAuthed: false })).toEqual({ kind: "unknown" });
    expect(gaAccountState({ ...facts, isAuthed: false, userId: null })).toEqual({ kind: "signed-out" });
    // A live session the app has not signed in yet (Google sign-up mid-way): wait.
    expect(gaAccountState({ ...facts, isAuthed: false, userId: "u1" })).toEqual({ kind: "unknown" });
    for (const f of [
      { ...facts, userId: null },
      { ...facts, consent: undefined },
      { ...facts, consentError: new Error("rpc") },
      { ...facts, consent: { status: "pending" as GaConsentStatus, birthYearKnown: true } },
      { ...facts, consent: { status: "granted" as GaConsentStatus, birthYearKnown: true } },
      { ...facts, consent: { status: "not_required" as GaConsentStatus, birthYearKnown: false } },
    ]) {
      expect(accountAllowsGa(gaAccountState(f))).toBe(false);
    }
    expect(accountAllowsGa(gaAccountState(facts))).toBe(true);
  });

  it("account state unknown (session restoring / connection error): no", () => {
    expect(accountAllowsGa({ kind: "unknown" })).toBe(false);
    expect(shouldLoadGa({ ...BASE, account: { kind: "unknown" } })).toBe(false);
  });

  it("signed-out visitor on a public page: yes", () => {
    expect(shouldLoadGa({ ...BASE, account: { kind: "signed-out" } })).toBe(true);
  });
});

describe("automation and internal browsers are skipped", () => {
  it.each([
    [true, false],
    [undefined, false],
    [false, true],
    [false, undefined],
  ] as const)("webdriver=%s internal=%s: no", (webdriver, internalFlag) => {
    expect(browserAllowsGa({ webdriver, internalFlag })).toBe(false);
    expect(shouldLoadGa({ ...BASE, webdriver, internalFlag })).toBe(false);
  });

  it("the whole matrix: yes only when every condition holds", () => {
    const accounts: GaAccountState[] = [
      { kind: "unknown" },
      { kind: "signed-out" },
      ...(["not_required", "pending", "granted", "unknown", undefined] as GaConsentStatus[]).flatMap((consentStatus) =>
        [true, false, undefined].map(
          (birthYearKnown) => ({ kind: "signed-in", consentStatus, birthYearKnown }) as GaAccountState
        )
      ),
    ];
    const tri = [true, false, undefined];
    for (const pathname of ["/", "/auth/callback"])
      for (const account of accounts)
        for (const webdriver of tri)
          for (const internalFlag of tri) {
            const expected =
              pathname === "/" &&
              webdriver === false &&
              internalFlag === false &&
              (account.kind === "signed-out" ||
                (account.kind === "signed-in" &&
                  account.consentStatus === "not_required" &&
                  account.birthYearKnown === true));
            expect(shouldLoadGa({ pathname, account, webdriver, internalFlag })).toBe(expected);
          }
  });
});

describe("?seeded_internal= and the internal flag", () => {
  function fakeStorage(init: Record<string, string> = {}) {
    const data = new Map(Object.entries(init));
    return {
      data,
      getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }
  const throwing = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };

  it("=1 sets it, =0 clears it, absent reads it", () => {
    const s = fakeStorage();
    expect(syncInternalFlag("", s)).toBe(false);
    expect(syncInternalFlag("?a=1&seeded_internal=1", s)).toBe(true);
    expect(s.data.get(GA_INTERNAL_FLAG_KEY)).toBe("1");
    expect(syncInternalFlag("", s)).toBe(true);
    expect(syncInternalFlag("?seeded_internal=0", s)).toBe(false);
    expect(s.data.has(GA_INTERNAL_FLAG_KEY)).toBe(false);
  });

  it("storage that throws never crashes, and still honours =1 for this page", () => {
    expect(syncInternalFlag("", throwing)).toBe(false);
    expect(syncInternalFlag("?seeded_internal=1", throwing)).toBe(true);
    expect(syncInternalFlag("?seeded_internal=1", null)).toBe(false);
  });

  it("internalParamAction reads the param", () => {
    expect(internalParamAction("?seeded_internal=1")).toBe("set");
    expect(internalParamAction("?seeded_internal=0")).toBe("clear");
    expect(internalParamAction("?other=1")).toBeNull();
  });

  it("the param is stripped, other params and the hash kept", () => {
    expect(stripInternalParam(`${ORIGIN}/schools?utr=9&seeded_internal=1&x=2#top`)).toBe("/schools?utr=9&x=2#top");
    expect(stripInternalParam(`${ORIGIN}/?seeded_internal=1`)).toBe("/");
    expect(stripInternalParam(`${ORIGIN}/?utr=9`)).toBeNull();
  });
});

describe("server purchase event (Whop webhook → GA4 Measurement Protocol)", () => {
  it("carries plan, price and currency — nothing that identifies anyone", () => {
    const body = purchaseEventBody({ plan: "family", value: 19 });
    expect(Object.keys(body).sort()).toEqual(["client_id", "events"]);
    expect(body.events).toHaveLength(1);
    const ev = body.events[0];
    expect(Object.keys(ev).sort()).toEqual(["name", "params"]);
    expect(ev.name).toBe("purchase");
    expect(Object.keys(ev.params).sort()).toEqual(["currency", "items", "value"]);
    expect(ev.params).toMatchObject({ value: 19, currency: "USD" });
    expect(ev.params.items).toEqual([{ item_name: "family subscription", price: 19, quantity: 1 }]);
    const json = JSON.stringify(body);
    for (const banned of ["user_id", "transaction_id", "email", "membership", "user_properties", "mem_"]) {
      expect(json).not.toContain(banned);
    }
    // Every key is pinned above, so a name/email field cannot slip in.
  });

  it("client_id is random per event, never derived from the buyer", () => {
    const a = purchaseEventBody({ plan: "player", value: 12 }).client_id;
    const b = purchaseEventBody({ plan: "player", value: 12 }).client_id;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    const src = codeOnly(join(ROOT, "lib/ga4-server.ts"));
    expect(src).toMatch(/clientId: string = randomUUID\(\)/);
    expect(src).toMatch(/JSON\.stringify\(purchaseEventBody\(input\)\)/);
  });

  it("the webhook passes plan and value only", () => {
    const src = codeOnly(join(ROOT, "app/api/whop/webhook/route.ts"));
    const calls = src.match(/reportPurchaseToGA4\(\s*\{[^}]*\}\s*\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect((calls[0] ?? "").replace(/\s+/g, " ")).toBe("reportPurchaseToGA4({ plan: outcome.tier, value })");
  });
});

// ---------------------------------------------------------------------------
// The runtime, driven end to end with a fake window. Everything gtag is ever
// handed lands in win.dataLayer, so these read back exactly what Google
// would receive.

const GA_ID = "G-TEST123";
const SIGNED_OUT_FACTS = {
  hydrated: true,
  connectionError: null as string | null,
  isAuthed: false,
  userId: null as string | null,
  consent: undefined as { status: GaConsentStatus; birthYearKnown: boolean } | undefined,
  consentError: undefined as unknown,
};
const SIGNED_IN_ADULT = {
  ...SIGNED_OUT_FACTS,
  isAuthed: true,
  userId: "user-1",
  consent: { status: "not_required" as GaConsentStatus, birthYearKnown: true },
};

function fakeWindow(url: string, referrer: string, opts: { webdriver?: boolean; storage?: Record<string, string> } = {}) {
  const store = new Map(Object.entries(opts.storage ?? {}));
  const win = {
    location: { href: url },
    document: { referrer },
    navigator: { webdriver: opts.webdriver ?? false },
    history: {
      state: null as unknown,
      replaceState(_data: unknown, _unused: string, next?: string) {
        if (next) win.location.href = new URL(next, win.location.href).href;
      },
    },
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  } as GaWindow & Record<string, unknown>;
  return { win, store };
}

function harness(url: string, referrer = "") {
  const { win, store } = fakeWindow(url, referrer);
  let scriptLoads = 0;
  const rt = new GaRuntime(GA_ID, win, () => {
    scriptLoads++;
  });
  const go = (href: string) => {
    win.location.href = new URL(href, win.location.href).href;
  };
  const update = (pathname: string, facts: Parameters<typeof gaAccountState>[0]) =>
    rt.update({ pathname, account: gaAccountState(facts) });
  const calls = () => (win.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
  const pageViews = () => calls().filter((c) => c[0] === "event" && c[1] === "page_view");
  const disabled = () => win[`ga-disable-${GA_ID}`];
  return { win, store, rt, go, update, calls, pageViews, disabled, scriptLoads: () => scriptLoads };
}

describe("GaRuntime: what gtag actually receives", () => {
  it("(a) nothing is created, pushed or injected while the account state is unknown", () => {
    const h = harness(`${ORIGIN}/schools`);
    h.update("/schools", { ...SIGNED_OUT_FACTS, hydrated: false });
    h.update("/schools", { ...SIGNED_OUT_FACTS, hydrated: false, isAuthed: true, userId: "u" });
    h.update("/schools", { ...SIGNED_OUT_FACTS, connectionError: "unreachable" });
    h.update("/schools", { ...SIGNED_IN_ADULT, consent: undefined }); // consent not answered
    h.update("/schools", { ...SIGNED_IN_ADULT, userId: null }); // whose session, not known
    h.update("/schools", { ...SIGNED_IN_ADULT, consentError: new Error("rpc") });
    expect(h.win.dataLayer).toBeUndefined();
    expect(h.win.gtag).toBeUndefined();
    expect(h.scriptLoads()).toBe(0);
    // ...and the moment it is known and allowed, exactly one load and one view.
    h.update("/schools", SIGNED_IN_ADULT);
    expect(h.scriptLoads()).toBe(1);
    expect(h.pageViews()).toHaveLength(1);
  });

  it("(b) no query, hash or raw referrer query reaches gtag, across navigations", () => {
    const h = harness(
      `${ORIGIN}/onboarding?utr=9.5&gpa=3.9&grad=2028&gender=girls#x`,
      `https://www.google.com/search?q=utr+9.5+gpa+3.9#frag`
    );
    h.update("/onboarding", SIGNED_OUT_FACTS);
    h.go("/schools?utr=11&gpa=4.0#fit");
    h.update("/schools", SIGNED_OUT_FACTS);
    h.go("/schools?utr=12"); // query-only change: same visit, no second view
    h.update("/schools", SIGNED_OUT_FACTS);
    h.go(`/onboarding?utr=9.5#again`);
    h.update("/onboarding", SIGNED_OUT_FACTS);

    const serialized = JSON.stringify(h.calls());
    for (const leak of ["?", "#", "utr", "gpa", "grad", "gender", "q=", "frag", "fit"]) {
      expect(serialized).not.toContain(leak);
    }
    expect(h.pageViews().map((c) => (c[2] as { page_path: string }).page_path)).toEqual([
      "/onboarding",
      "/schools",
      "/onboarding",
    ]);
    // Exactly the commands we expect, in order: js, config, then set → page_view per visit.
    expect(h.calls().map((c) => c[0])).toEqual(["js", "config", "set", "event", "set", "event", "set", "event"]);
    const config = h.calls()[1];
    expect(config[1]).toBe(GA_ID);
    expect(config[2]).toMatchObject({
      send_page_view: false,
      page_location: `${ORIGIN}/onboarding`,
      page_referrer: "https://www.google.com/search",
    });
    expect(h.calls()[2]).toEqual(["set", { page_location: `${ORIGIN}/onboarding`, page_referrer: "https://www.google.com/search" }]);
    expect(h.calls()[4]).toEqual(["set", { page_location: `${ORIGIN}/schools`, page_referrer: `${ORIGIN}/onboarding` }]);
  });

  it("(c) nothing for /auth/*, and nothing for an account that needed a parent's consent", () => {
    const auth = harness(`${ORIGIN}/auth/callback?code=secret&next=%2Ftoday`);
    auth.update("/auth/callback", SIGNED_OUT_FACTS);
    auth.update("/auth/x", SIGNED_IN_ADULT);
    expect(auth.win.dataLayer).toBeUndefined();
    expect(auth.scriptLoads()).toBe(0);

    for (const consent of [
      { status: "pending" as GaConsentStatus, birthYearKnown: true },
      { status: "granted" as GaConsentStatus, birthYearKnown: true },
      { status: "unknown" as GaConsentStatus, birthYearKnown: false },
      { status: "not_required" as GaConsentStatus, birthYearKnown: false },
    ]) {
      const h = harness(`${ORIGIN}/today`);
      h.update("/today", { ...SIGNED_IN_ADULT, consent });
      expect(h.win.dataLayer).toBeUndefined();
      expect(h.scriptLoads()).toBe(0);
    }
  });

  it.each(["/login", "/signup", "/parent-signup", "/reset-password", "/auth/complete"])(
    "a first visit straight to %s creates nothing and injects nothing",
    (path) => {
      for (const facts of [SIGNED_OUT_FACTS, SIGNED_IN_ADULT]) {
        const h = harness(`${ORIGIN}${path}?next=%2Ftoday`);
        h.rt.guardPath(path);
        h.update(path, facts);
        expect(h.win.dataLayer).toBeUndefined();
        expect(h.win.gtag).toBeUndefined();
        expect(h.scriptLoads()).toBe(0);
        expect(h.disabled()).toBeUndefined();
      }
    }
  );

  it("client navigation public -> /login -> /signup -> public: no view for the auth pages, gtag off before the route commits", () => {
    const h = harness(`${ORIGIN}/pricing`);
    h.rt.guardPath("/pricing");
    h.update("/pricing", SIGNED_OUT_FACTS);
    expect(h.scriptLoads()).toBe(1);
    expect(h.pageViews()).toHaveLength(1);
    expect(h.disabled()).toBe(false);
    const before = h.calls().length;

    // The component's render-time guard runs before the effect's update():
    // gtag is already off when the new route's history entry is pushed.
    h.rt.guardPath("/login");
    expect(h.disabled()).toBe(true);
    h.go("/login?next=%2Ftoday");
    h.update("/login", SIGNED_OUT_FACTS);
    expect(h.disabled()).toBe(true);

    h.rt.guardPath("/signup");
    h.go("/signup");
    h.update("/signup", SIGNED_OUT_FACTS);
    expect(h.disabled()).toBe(true);
    // Nothing at all was handed to gtag on either auth page.
    expect(h.calls()).toHaveLength(before);

    // guardPath never re-enables: only update() does, after every rule.
    h.rt.guardPath("/schools");
    expect(h.disabled()).toBe(true);
    h.go("/schools");
    h.update("/schools", SIGNED_OUT_FACTS);
    expect(h.disabled()).toBe(false);
    expect(h.scriptLoads()).toBe(1);
    const views = h.pageViews().map((c) => (c[2] as { page_path: string }).page_path);
    expect(views).toEqual(["/pricing", "/schools"]);
    // The referrer for /schools is the last COUNTED page, never the auth page.
    expect(JSON.stringify(h.calls())).not.toMatch(/login|signup/);

    // ...and back again: still nothing for the auth page.
    const again = h.calls().length;
    h.rt.guardPath("/reset-password");
    h.go("/reset-password");
    h.update("/reset-password", SIGNED_OUT_FACTS);
    expect(h.disabled()).toBe(true);
    expect(h.calls()).toHaveLength(again);
  });

  it("guardPath before gtag was ever loaded does nothing (no flag, no dataLayer)", () => {
    const h = harness(`${ORIGIN}/login`);
    h.rt.guardPath("/login");
    h.rt.guardPath("/schools");
    expect(h.disabled()).toBeUndefined();
    expect(h.win.dataLayer).toBeUndefined();
    // and it does not stop a later allowed page from loading normally
    h.go("/schools");
    h.update("/schools", SIGNED_OUT_FACTS);
    expect(h.scriptLoads()).toBe(1);
    expect(h.pageViews()).toHaveLength(1);
  });

  it("once loaded, a later no turns gtag off and sends nothing more", () => {
    const h = harness(`${ORIGIN}/`);
    h.update("/", SIGNED_OUT_FACTS);
    expect(h.disabled()).toBe(false);
    const before = h.calls().length;
    // an under-13 signs in on this tab
    h.update("/", { ...SIGNED_IN_ADULT, userId: "child", consent: { status: "pending", birthYearKnown: true } });
    h.go("/today");
    h.update("/today", { ...SIGNED_IN_ADULT, userId: "child", consent: { status: "granted", birthYearKnown: true } });
    h.go("/auth/complete");
    h.update("/auth/complete", SIGNED_OUT_FACTS);
    expect(h.disabled()).toBe(true);
    expect(h.calls()).toHaveLength(before);
    expect(h.scriptLoads()).toBe(1);
    // back to a public page, signed out: allowed again, a fresh view for it
    h.go("/schools");
    h.update("/schools", SIGNED_OUT_FACTS);
    expect(h.disabled()).toBe(false);
    expect(h.pageViews()).toHaveLength(2);
  });

  it("automation is skipped", () => {
    const { win } = fakeWindow(`${ORIGIN}/`, "", { webdriver: true });
    let loads = 0;
    new GaRuntime(GA_ID, win, () => loads++).update({ pathname: "/", account: { kind: "signed-out" } });
    expect(win.dataLayer).toBeUndefined();
    expect(loads).toBe(0);
  });

  it("?seeded_internal=1 on the CURRENT path applies at once, and is stripped from the URL", () => {
    const h = harness(`${ORIGIN}/schools`);
    h.update("/schools", SIGNED_OUT_FACTS);
    expect(h.pageViews()).toHaveLength(1);
    const before = h.calls().length;
    h.go("/schools?utr=9&seeded_internal=1#top"); // same pathname, search changes
    h.update("/schools", SIGNED_OUT_FACTS);
    expect(h.store.get(GA_INTERNAL_FLAG_KEY)).toBe("1");
    expect(h.win.location.href).toBe(`${ORIGIN}/schools?utr=9#top`);
    expect(h.disabled()).toBe(true);
    h.go("/today");
    h.update("/today", SIGNED_OUT_FACTS);
    expect(h.calls()).toHaveLength(before);
  });

  it("an internal browser never loads it at all", () => {
    const { win } = fakeWindow(`${ORIGIN}/`, "", { storage: { [GA_INTERNAL_FLAG_KEY]: "1" } });
    let loads = 0;
    new GaRuntime(GA_ID, win, () => loads++).update({ pathname: "/", account: { kind: "signed-out" } });
    expect(win.dataLayer).toBeUndefined();
    expect(loads).toBe(0);
  });
});

describe("components/shared/google-analytics.tsx is wiring only", () => {
  const src = codeOnly(join(ROOT, "components/shared/google-analytics.tsx"));

  it("never talks to gtag, dataLayer, the URL or the referrer itself", () => {
    // Only the global type declaration may name them.
    const body = src.replace(/declare global \{[\s\S]*?\n\}\n/, "");
    expect(body).not.toMatch(/gtag\s*\(|dataLayer|page_|document\.|location\.|shouldLoadGa|ga-disable/);
    expect(body).not.toMatch(/searchParams\.get|searchKey\s*\)/);
  });

  it("feeds the runtime the tested account state and re-runs on path, search and session", () => {
    expect(src).toMatch(/gaAccountState\(\{ hydrated, connectionError, isAuthed, userId, consent, consentError \}\)/);
    expect(src).toMatch(/useSWR\(\s*isAuthed && hydrated \? myConsentStateKey\(userId\) : null,/);
    expect(src).toMatch(/new GaRuntime\(id, window, \(\) => setScriptWanted\(true\)\)/);
    // The render-time half of rule 2: asked on every client render, before
    // the effect, for the path being rendered.
    expect(src).toMatch(/if \(typeof window !== "undefined"\) \{[\s\S]*?runtime\.current\.guardPath\(pathname\);\s*\}/);
    expect(src.indexOf("guardPath(pathname)")).toBeLessThan(src.indexOf("useEffect("));
    expect(src).toMatch(/runtime\.current\.update\(\{ pathname, account \}\);\s*\}, \[id, pathname, searchKey, account\]\);/);
    expect(src.match(/\.update\(/g)).toHaveLength(1);
  });

  it("has no inline bootstrap, and injects gtag.js only after the runtime asks", () => {
    expect(src).not.toMatch(/dangerouslySetInnerHTML|<Script\s+id=/);
    expect(src.match(/googletagmanager\.com\/gtag\/js/g)).toHaveLength(1);
    expect(src.indexOf("if (!scriptWanted) return null;")).toBeGreaterThan(-1);
    expect(src.indexOf("if (!scriptWanted) return null;")).toBeLessThan(src.indexOf("googletagmanager.com/gtag/js"));
    expect(src.match(/setScriptWanted\(true\)/g)).toHaveLength(1);
  });

  it("is mounted inside <Providers> (it needs the session)", () => {
    const layout = codeOnly(join(ROOT, "app/layout.tsx"));
    const open = layout.indexOf("<Providers>");
    const close = layout.indexOf("</Providers>");
    const ga = layout.indexOf("<GoogleAnalytics />");
    expect(ga).toBeGreaterThan(open);
    expect(ga).toBeLessThan(close);
    expect(layout.match(/<GoogleAnalytics \/>/g)).toHaveLength(1);
  });

  it("every consent-state cache is keyed by user", () => {
    for (const file of ["components/shared/auth-gate.tsx", "lib/hooks/use-star-schools.ts", "components/shared/google-analytics.tsx"]) {
      const code = codeOnly(join(ROOT, file));
      expect(code).toMatch(/myConsentStateKey\(userId\)/);
      expect(code).not.toMatch(/MY_CONSENT_STATE_KEY|"my-consent-state"/);
    }
  });
});
