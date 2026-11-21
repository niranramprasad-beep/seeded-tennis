import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import {
  GA_INTERNAL_FLAG_KEY,
  accountAllowsGa,
  browserAllowsGa,
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

// Guards for Google Analytics (audit A-201 and the GA privacy change). Fails
// the build if:
//   - anything GA is given as a page (page_path, page_location,
//     page_referrer) can carry a query string or hash;
//   - GA can load or fire on /auth/*;
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
    expect(gaReferrer("")).toBeUndefined();
    expect(gaReferrer("not a url")).toBeUndefined();
    expect(gaReferrer("android-app://com.google/?q=1")).toBeUndefined();
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

describe("never on /auth/*", () => {
  it.each(["/auth", "/auth/", "/auth/callback", "/auth/complete", "/auth/verified?x=1", "/AUTH/Callback"])(
    "%s is excluded even when everything else allows it",
    (pathname) => {
      expect(isGaExcludedPath(pathname)).toBe(true);
      expect(shouldLoadGa({ ...BASE, pathname })).toBe(false);
    }
  );

  it.each(["/", "/authors", "/schools", "/login", "/how-it-works"])("%s is not /auth", (pathname) => {
    expect(isGaExcludedPath(pathname)).toBe(false);
    expect(shouldLoadGa({ ...BASE, pathname })).toBe(true);
  });
});

describe("never for an account that needed a parent's consent, never before we know", () => {
  const blocked: GaConsentStatus[] = ["pending", "granted", "unknown", undefined];
  it.each(blocked)("signed in with consent %s: no", (consentStatus) => {
    const account: GaAccountState = { kind: "signed-in", consentStatus };
    expect(accountAllowsGa(account)).toBe(false);
    expect(shouldLoadGa({ ...BASE, account })).toBe(false);
  });

  it("signed in with consent not_required: yes", () => {
    const account: GaAccountState = { kind: "signed-in", consentStatus: "not_required" };
    expect(shouldLoadGa({ ...BASE, account })).toBe(true);
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
      ...(["not_required", "pending", "granted", "unknown", undefined] as GaConsentStatus[]).map(
        (consentStatus) => ({ kind: "signed-in", consentStatus }) as GaAccountState
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
                (account.kind === "signed-in" && account.consentStatus === "not_required"));
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

describe("components/shared/google-analytics.tsx is wired through the tested rules", () => {
  const src = codeOnly(join(ROOT, "components/shared/google-analytics.tsx"));

  it("never reads the query into anything it sends", () => {
    expect(src).not.toMatch(/useSearchParams|searchParams\.toString/);
    expect(src).not.toMatch(/\?\$\{/); // `${path}?${query}`
    expect(src).not.toMatch(/page_path\s*:/); // only gaPageViewParams() builds it
    // the one page_location it writes is the builder's
    expect(src.match(/page_location\s*:/g)).toHaveLength(1);
    expect(src).toMatch(/page_location: params\.page_location/);
    // location.href is read for one thing: stripping ?seeded_internal=
    expect(src.match(/location\.href/g)).toHaveLength(1);
    expect(src).toMatch(/stripInternalParam\(window\.location\.href\)/);
  });

  it("builds every page-ish value with the tested functions", () => {
    expect(src).toMatch(/window\.gtag\(\s*"config",\s*id,\s*gaConfigParams\(gaPageLocation\(origin, pathname\), gaReferrer\(document\.referrer\)\)/);
    expect(src).toMatch(/const params = gaPageViewParams\(origin, pathname, referrer\)/);
    expect(src).toMatch(/window\.gtag\("event", "page_view", params\)/);
    expect(src).toMatch(/lastLocation\.current \?\? gaReferrer\(document\.referrer\)/);
  });

  it("has no inline bootstrap: nothing from Google exists until the rule says yes", () => {
    expect(src).not.toMatch(/dangerouslySetInnerHTML|<Script\s+id=/);
    expect(src.match(/googletagmanager\.com\/gtag\/js/g)).toHaveLength(1);
    expect(src.indexOf("if (!scriptWanted) return null;")).toBeGreaterThan(-1);
    expect(src.indexOf("if (!scriptWanted) return null;")).toBeLessThan(src.indexOf("googletagmanager.com/gtag/js"));
    expect(src.match(/setScriptWanted\(true\)/g)).toHaveLength(1);
  });

  it("asks shouldLoadGa() with the real session state, and unknown stays unknown", () => {
    expect(src).toMatch(/const allowed = shouldLoadGa\(\{/);
    expect(src).toMatch(/!hydrated \|\| connectionError\s*\?\s*\{ kind: "unknown" \}/);
    expect(src).toMatch(/!isAuthed\s*\?\s*\{ kind: "signed-out" \}/);
    expect(src).toMatch(/consentStatus: consentError \? "unknown" : consent\?\.status/);
    expect(src).toMatch(/webdriver: env\?\.webdriver/);
    expect(src).toMatch(/internalFlag: env\?\.internalFlag/);
  });

  it("re-checks the browser flags at send time and stops before loading or sending", () => {
    expect(src).toMatch(/const allowedNow =\s*allowed &&\s*browserAllowsGa\(\{\s*webdriver: readWebdriver\(\),\s*internalFlag: syncInternalFlag\(/);
    expect(src).toMatch(/navigator\.webdriver === true/);
    const stop = src.indexOf("if (!allowedNow) {");
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(src.indexOf("bootstrapped.current = true"));
    expect(stop).toBeLessThan(src.indexOf('window.gtag("event"'));
    // and turns gtag off when it was loaded earlier
    expect(src.slice(stop, src.indexOf("return;", stop))).toMatch(/setGaDisabled\(id, true\)/);
    expect(src).toMatch(/`ga-disable-\$\{id\}`/);
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
});
