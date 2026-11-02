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

interface DesignContextValue {
  design: DesignSystemId;
  setDesign: (d: DesignSystemId) => void;
  seededMode: SeededMode;
  setSeededMode: (m: SeededMode) => void;
  /** Same hydration-gap pattern as ThemeProvider (see theme-context.tsx) —
   * design/seededMode default to "seeded"/"dark" on the server and first
   * client render to avoid a hydration mismatch with the pre-paint script in
   * app/layout.tsx, which has already set the real attributes on <html>
   * synchronously. Anything that renders design-specific UI should wait for
   * this before trusting either value. */
  hydrated: boolean;
}

const DesignContext = createContext<DesignContextValue | null>(null);

export function DesignProvider({ children }: { children: ReactNode }) {
  // "seeded" is the default for anyone who has never explicitly chosen —
  // new visitors and existing ones alike. Legacy is an opt-in escape
  // hatch now, not the default.
  const [design, setDesignState] = useState<DesignSystemId>("seeded");
  const [seededMode, setSeededModeState] = useState<SeededMode>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedDesign = window.localStorage.getItem(DESIGN_STORAGE_KEY);
      if (storedDesign === "legacy" || storedDesign === "seeded") {
        setDesignState(storedDesign);
        document.documentElement.setAttribute("data-design", storedDesign);
      }
      const storedMode = window.localStorage.getItem(SEEDED_MODE_STORAGE_KEY);
      if (storedMode === "dark" || storedMode === "light") {
        setSeededModeState(storedMode);
        document.documentElement.setAttribute("data-seeded-mode", storedMode);
      }
    } catch {
      // ignore
    }
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

  const setSeededMode = useCallback((m: SeededMode) => {
    setSeededModeState(m);
    document.documentElement.setAttribute("data-seeded-mode", m);
    try {
      window.localStorage.setItem(SEEDED_MODE_STORAGE_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ design, setDesign, seededMode, setSeededMode, hydrated }),
    [design, setDesign, seededMode, setSeededMode, hydrated]
  );

  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesign() {
  const ctx = useContext(DesignContext);
  if (!ctx) throw new Error("useDesign must be used within a DesignProvider");
  return ctx;
}
