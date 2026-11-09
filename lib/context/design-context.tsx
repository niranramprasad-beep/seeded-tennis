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

export type DesignSystemId = "legacy" | "seeded";
export type SeededMode = "dark" | "light";

export const DESIGN_STORAGE_KEY = "seeded.design";
export const SEEDED_MODE_STORAGE_KEY = "seeded.mode";
// Separate from SEEDED_MODE_STORAGE_KEY on purpose: `data-seeded-mode` (and
// everything CSS keys off) must always hold a concrete "dark"/"light" value,
// never a third "system" string — see the systemSync doc comment below for
// why this stays a parallel preference flag instead of a 3rd SeededMode.
const SYSTEM_SYNC_STORAGE_KEY = "seeded.mode.system";

interface DesignContextValue {
  design: DesignSystemId;
  setDesign: (d: DesignSystemId) => void;
  seededMode: SeededMode;
  setSeededMode: (m: SeededMode) => void;
  /** True when the user picked "Match system" in Settings' Appearance card
   * instead of an explicit Light/Dark. `seededMode` above still always
   * holds a real resolved "dark"/"light" (whatever the OS currently
   * reports) — this flag only controls whether it keeps following the OS
   * preference live via a `prefers-color-scheme` listener. Explicitly
   * picking Light or Dark turns it back off. */
  systemSync: boolean;
  setSystemSync: (v: boolean) => void;
  /** Same hydration-gap pattern as ThemeProvider (see theme-context.tsx) —
   * design/seededMode default to "seeded"/"dark" on the server and first
   * client render to avoid a hydration mismatch with the pre-paint script in
   * app/layout.tsx, which has already set the real attributes on <html>
   * synchronously. Anything that renders design-specific UI should wait for
   * this before trusting either value. */
  hydrated: boolean;
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    return false;
  }
}

const DesignContext = createContext<DesignContextValue | null>(null);

export function DesignProvider({ children }: { children: ReactNode }) {
  // "seeded" is the default for anyone who has never explicitly chosen —
  // new visitors and existing ones alike. Legacy is an opt-in escape
  // hatch now, not the default.
  const [design, setDesignState] = useState<DesignSystemId>("seeded");
  const [seededMode, setSeededModeState] = useState<SeededMode>("dark");
  const [systemSync, setSystemSyncState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Resolve to a concrete value either way (stored or the default) and
    // ALWAYS write both attributes — leaving data-seeded-mode unset when
    // there's no stored preference would mean the
    // [data-design="seeded"][data-seeded-mode="dark"] selector in
    // app/globals.css never matches, silently falling through to
    // Legacy's :root colors despite data-design correctly saying "seeded".
    let resolvedDesign: DesignSystemId = "seeded";
    let resolvedMode: SeededMode = "dark";
    let resolvedSystemSync = false;
    try {
      const storedDesign = window.localStorage.getItem(DESIGN_STORAGE_KEY);
      if (storedDesign === "legacy" || storedDesign === "seeded") resolvedDesign = storedDesign;
      const storedMode = window.localStorage.getItem(SEEDED_MODE_STORAGE_KEY);
      if (storedMode === "dark" || storedMode === "light") resolvedMode = storedMode;
      resolvedSystemSync = window.localStorage.getItem(SYSTEM_SYNC_STORAGE_KEY) === "1";
      // "Match system" wins over whatever concrete mode was last stored —
      // the stored mode is kept around only as the fallback for the next
      // time systemSync is off (see setSystemSync below).
      if (resolvedSystemSync) resolvedMode = systemPrefersDark() ? "dark" : "light";
    } catch {
      // ignore
    }
    setDesignState(resolvedDesign);
    setSeededModeState(resolvedMode);
    setSystemSyncState(resolvedSystemSync);
    document.documentElement.setAttribute("data-design", resolvedDesign);
    document.documentElement.setAttribute("data-seeded-mode", resolvedMode);
    setHydrated(true);
  }, []);

  const setDesign = useCallback((d: DesignSystemId) => {
    setDesignState(d);
    document.documentElement.setAttribute("data-design", d);
    try {
      window.localStorage.setItem(DESIGN_STORAGE_KEY, d);
    } catch {
      // ignore
    }
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
      if (v) setSeededMode(systemPrefersDark() ? "dark" : "light");
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
      design,
      setDesign,
      seededMode,
      setSeededMode,
      systemSync,
      setSystemSync,
      hydrated,
    }),
    [design, setDesign, seededMode, setSeededMode, systemSync, setSystemSync, hydrated]
  );

  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesign() {
  const ctx = useContext(DesignContext);
  if (!ctx) throw new Error("useDesign must be used within a DesignProvider");
  return ctx;
}
