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

export type DesignSystemId = "legacy" | "premium";
export type PremiumMode = "dark" | "light";

export const DESIGN_STORAGE_KEY = "seeded.design";
export const PREMIUM_MODE_STORAGE_KEY = "seeded.premium-mode";

interface DesignContextValue {
  design: DesignSystemId;
  setDesign: (d: DesignSystemId) => void;
  premiumMode: PremiumMode;
  setPremiumMode: (m: PremiumMode) => void;
  /** Same hydration-gap pattern as ThemeProvider (see theme-context.tsx) —
   * design/premiumMode default to "legacy"/"dark" on the server and first
   * client render to avoid a hydration mismatch with the pre-paint script in
   * app/layout.tsx, which has already set the real attributes on <html>
   * synchronously. Anything that renders design-specific UI should wait for
   * this before trusting either value. */
  hydrated: boolean;
}

const DesignContext = createContext<DesignContextValue | null>(null);

export function DesignProvider({ children }: { children: ReactNode }) {
  const [design, setDesignState] = useState<DesignSystemId>("legacy");
  const [premiumMode, setPremiumModeState] = useState<PremiumMode>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedDesign = window.localStorage.getItem(DESIGN_STORAGE_KEY);
      if (storedDesign === "legacy" || storedDesign === "premium") {
        setDesignState(storedDesign);
        document.documentElement.setAttribute("data-design", storedDesign);
      }
      const storedMode = window.localStorage.getItem(PREMIUM_MODE_STORAGE_KEY);
      if (storedMode === "dark" || storedMode === "light") {
        setPremiumModeState(storedMode);
        document.documentElement.setAttribute("data-premium-mode", storedMode);
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

  const setPremiumMode = useCallback((m: PremiumMode) => {
    setPremiumModeState(m);
    document.documentElement.setAttribute("data-premium-mode", m);
    try {
      window.localStorage.setItem(PREMIUM_MODE_STORAGE_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ design, setDesign, premiumMode, setPremiumMode, hydrated }),
    [design, setDesign, premiumMode, setPremiumMode, hydrated]
  );

  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesign() {
  const ctx = useContext(DesignContext);
  if (!ctx) throw new Error("useDesign must be used within a DesignProvider");
  return ctx;
}
