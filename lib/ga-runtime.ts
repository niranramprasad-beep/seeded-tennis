// Everything the Google Analytics component DOES, as a class with no React in
// it, so lib/ga-privacy.test.ts can drive it with a fake window and read
// back every argument it ever handed to gtag. The component
// (components/shared/google-analytics.tsx) only builds the account state
// from React hooks and calls update(); it never touches gtag itself.
//
// Per update():
//   1. Apply and strip ?seeded_internal= from the current URL.
//   2. Ask shouldLoadGa(). No: if gtag was loaded earlier, set
//      `ga-disable-<ID>` so it sends nothing more, and stop.
//   3. Yes, first time: create dataLayer/gtag, `js` + `config` with
//      send_page_view:false and path-only page_location/page_referrer, then
//      ask for gtag.js to be injected (onLoadScript).
//   4. On each new path: `set` path-only page_location/page_referrer, so
//      anything gtag sends by itself (enhanced measurement, where gtag
//      honours set values) inherits them, then one page_view.
//
// Not closed by code: GA4 enhanced measurement is configured in the GA
// property, and some of its events (outbound clicks' link_url, history
// changes, site search) may read the browser's address or the clicked link
// directly. It must be switched off in GA Admin — docs/MASTER_ROADMAP.md.

import {
  gaConfigParams,
  gaPageLocation,
  gaPageViewParams,
  gaReferrer,
  shouldLoadGa,
  stripInternalParam,
  syncInternalFlag,
  type GaAccountState,
} from "@/lib/ga-privacy";

type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The slice of `window` the runtime uses. The real window satisfies it. */
export interface GaWindow {
  location: { href: string };
  document: { referrer: string };
  navigator: { webdriver?: boolean };
  history: { state: unknown; replaceState(data: unknown, unused: string, url?: string): void };
  localStorage: FlagStorage;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

export interface GaUpdate {
  pathname: string;
  account: GaAccountState;
}

export class GaRuntime {
  private bootstrapped = false;
  private visitPath: string | null = null;
  private sentForVisit = false;
  private lastLocation: string | undefined;

  constructor(
    private readonly id: string,
    private readonly win: GaWindow,
    private readonly onLoadScript: () => void
  ) {}

  private storage(): FlagStorage | null {
    try {
      return this.win.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private href(): string {
    try {
      return this.win.location.href;
    } catch {
      return "";
    }
  }

  private origin(): string {
    try {
      return new URL(this.href()).origin;
    } catch {
      return "";
    }
  }

  private webdriver(): boolean {
    try {
      return this.win.navigator.webdriver === true;
    } catch {
      return true;
    }
  }

  private setDisabled(disabled: boolean) {
    (this.win as unknown as Record<string, unknown>)[`ga-disable-${this.id}`] = disabled;
  }

  /** The raw referrer, reduced to origin + path before anything sees it. */
  private safeDocumentReferrer(): string | undefined {
    try {
      return gaReferrer(this.win.document.referrer);
    } catch {
      return undefined;
    }
  }

  /** Re-asks every rule. Call on every route, search-param or session change. */
  update({ pathname, account }: GaUpdate): void {
    // 1. ?seeded_internal= — applied, then taken out of the address bar.
    let search = "";
    try {
      search = new URL(this.href()).search;
    } catch {
      search = "";
    }
    const internalFlag = syncInternalFlag(search, this.storage());
    const stripped = stripInternalParam(this.href());
    if (stripped !== null) {
      try {
        this.win.history.replaceState(this.win.history.state, "", stripped);
      } catch {
        // The flag is applied either way.
      }
    }

    if (this.visitPath !== pathname) {
      this.visitPath = pathname;
      this.sentForVisit = false;
    }

    // 2. The one gate.
    const allowed = shouldLoadGa({
      pathname,
      account,
      webdriver: this.webdriver(),
      internalFlag,
    });
    if (!allowed) {
      if (this.bootstrapped) this.setDisabled(true);
      return;
    }

    // 3. First allowed moment: set gtag up, then ask for gtag.js.
    const origin = this.origin();
    if (!this.bootstrapped) {
      this.bootstrapped = true;
      this.setDisabled(false);
      const win = this.win;
      win.dataLayer = win.dataLayer || [];
      // gtag.js reads Arguments objects off dataLayer, not arrays.
      win.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        win.dataLayer!.push(arguments);
      };
      win.gtag("js", new Date());
      win.gtag("config", this.id, gaConfigParams(gaPageLocation(origin, pathname), this.safeDocumentReferrer()));
      this.onLoadScript();
    } else {
      this.setDisabled(false);
    }

    // 4. One page_view per path visit, with path-only values set first.
    if (this.sentForVisit || !this.win.gtag) return;
    this.sentForVisit = true;
    const referrer = this.lastLocation ?? this.safeDocumentReferrer();
    const params = gaPageViewParams(origin, pathname, referrer);
    this.win.gtag("set", {
      page_location: params.page_location,
      ...(params.page_referrer ? { page_referrer: params.page_referrer } : {}),
    });
    this.win.gtag("event", "page_view", params);
    this.lastLocation = params.page_location;
  }
}
