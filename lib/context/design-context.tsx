"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  RETIRED_DESIGN_STORAGE_KEY,
  RETIRED_THEME_STORAGE_KEY,
  choseRetiredDesign,
  parseSeededMode,
  resolveStoredSystemSync,
  SEEDED_MODE_STORAGE_KEY,
  SYSTEM_SYNC_STORAGE_KEY,
  type SeededMode,
} from "@/lib/appearance";

export type { SeededMode } from "@/lib/appearance";

// SYSTEM_SYNC_STORAGE_KEY is separate from SEEDED_MODE_STORAGE_KEY on purpose: `data-seeded-mode` (and
// everything CSS keys off) must always hold a concrete "dark"/"light" value,
// never a third "system" string — see the systemSync doc comment below for
// why this stays a parallel preference flag instead of a 3rd SeededMode.

// The appearance of the one design, Seeded: Light, Dark or Match system.
// (There used to be a second, opt-in "Legacy" design chosen here too; it was
// deleted on 2026-11-20 — see lib/appearance.ts for how a stored "legacy"
// choice is read now.)
interface DesignContextValue {
  seededMode: SeededMode;
  setSeededMode: (m: SeededMode) => void;
  /** True when the user picked "Match system" in Settings' Appearance card,
   * OR when nobody has ever saved any mode preference on this browser at
   * all (a brand-new visitor's real first default is the OS preference,
   * not a hardcoded mode — see the mount effect below). `seededMode` above
   * still always holds a real resolved "dark"/"light" (whatever the OS
   * currently reports) — this flag only controls whether it keeps
   * following the OS preference live via a `prefers-color-scheme`
   * listener. Explicitly picking Light or Dark turns it back off, for
   * good — see setSystemSync. */
  systemSync: boolean;
  setSystemSync: (v: boolean) => void;
  /** Same hydration-gap pattern as the other contexts — seededMode defaults
   * to "dark" on the server and first client render to avoid a hydration
   * mismatch with the pre-paint script in app/layout.tsx, which has already
   * set the real attribute on <html> synchronously. Anything that renders
   * mode-specific UI should wait for this before trusting the value. */
  hydrated: boolean;
}

/** The mode the OS currently asks for. */
export function systemMode(): SeededMode {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

const DesignContext = createContext<DesignContextValue | null>(null);

export function DesignProvider({ children }: { children: ReactNode }) {
  const [seededMode, setSeededModeState] = useState<SeededMode>("dark");
  const [systemSync, setSystemSyncState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Resolve to a concrete value either way (stored or the default) and
    // ALWAYS write the attribute — leaving data-seeded-mode unset would mean
    // neither :root[data-seeded-mode=…] block in app/globals.css matches.
    let resolvedMode: SeededMode = "dark";
    let resolvedSystemSync = false;
    try {
      const storage = window.localStorage;
      const storedDesign = storage.getItem(RETIRED_DESIGN_STORAGE_KEY);
      resolvedMode = parseSeededMode(storage.getItem(SEEDED_MODE_STORAGE_KEY)) ?? resolvedMode;
      // A brand-new visitor — nobody has ever saved a preference on this
      // browser, explicit or "system" — gets the OS preference as their
      // real first default instead of a hardcoded "dark", same as "System"
      // means for anyone who picks it later. Once any explicit Light/Dark
      // pill is clicked, setSystemSync(false) below writes "0" here, so
      // this branch only ever fires once per browser. A browser that had
      // picked the deleted Legacy design follows the OS too.
      resolvedSystemSync = resolveStoredSystemSync({
        systemSync: storage.getItem(SYSTEM_SYNC_STORAGE_KEY),
        design: storedDesign,
      });
      // One-time tidy-up of the deleted design's keys. The Legacy choice is
      // carried over as an explicit "Match system", so dropping the key
      // cannot change what the next visit shows.
      if (choseRetiredDesign(storedDesign)) storage.setItem(SYSTEM_SYNC_STORAGE_KEY, "1");
      storage.removeItem(RETIRED_DESIGN_STORAGE_KEY);
      storage.removeItem(RETIRED_THEME_STORAGE_KEY);
      // "Match system" wins over whatever concrete mode was last stored —
      // the stored mode is kept around only as the fallback for the next
      // time systemSync is off (see setSystemSync below).
      if (resolvedSystemSync) resolvedMode = systemMode();
    } catch {
      // ignore
    }
    setSeededModeState(resolvedMode);
    setSystemSyncState(resolvedSystemSync);
    document.documentElement.setAttribute("data-seeded-mode", resolvedMode);
    setHydrated(true);
  }, []);

  // The concrete mode actually painted — `data-seeded-mode` (and every CSS
  // selector keyed off it) must only ever hold "dark"/"light", so this is
  // always the resolved value, whether the user picked it explicitly or
  // it's being driven live by the OS via systemSync below.
  const setSeededMode = useCallback((m: SeededMode) => {
    setSeededModeState(m);
    document.documentElement.setAttribute("data-seeded-mode", m);
    try {
      window.localStorage.setItem(SEEDED_MODE_STORAGE_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const setSystemSync = useCallback(
    (v: boolean) => {
      setSystemSyncState(v);
      try {
        window.localStorage.setItem(SYSTEM_SYNC_STORAGE_KEY, v ? "1" : "0");
      } catch {
        // ignore
      }
      // Resolve immediately so picking "Match system" doesn't wait for the
      // next OS change event to actually take effect.
      if (v) setSeededMode(systemMode());
    },
    [setSeededMode]
  );

  // While systemSync is on, keep following the OS preference live (e.g. the
  // user's system switches to dark at sunset) instead of only resolving it
  // once at mount/toggle time.
  useEffect(() => {
    if (!systemSync) return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setSeededMode(e.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [systemSync, setSeededMode]);

  const value = useMemo(
    () => ({
      seededMode,
      setSeededMode,
      systemSync,
      setSystemSync,
      hydrated,
    }),
    [seededMode, setSeededMode, systemSync, setSystemSync, hydrated]
  );

  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesign() {
  const ctx = useContext(DesignContext);
  if (!ctx) throw new Error("useDesign must be used within a DesignProvider");
  return ctx;
}
