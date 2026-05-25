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
import type { Gender } from "@/lib/types";

const GENDER_KEY = "seeded.browseGender";

interface GenderContextValue {
  gender: Gender;
  setGender: (g: Gender) => void;
}

const GenderContext = createContext<GenderContextValue | null>(null);

// Browse preference (men's vs women's listings). Separate from the player's own
// gender so anyone can explore either side.
export function GenderProvider({ children }: { children: ReactNode }) {
  const [gender, setGenderState] = useState<Gender>("men");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(GENDER_KEY) as Gender | null;
      if (stored === "men" || stored === "women") setGenderState(stored);
    } catch {
      // ignore
    }
  }, []);

  const setGender = useCallback((g: Gender) => {
    setGenderState(g);
    try {
      window.localStorage.setItem(GENDER_KEY, g);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ gender, setGender }), [gender, setGender]);
  return <GenderContext.Provider value={value}>{children}</GenderContext.Provider>;
}

export function useGender() {
  const ctx = useContext(GenderContext);
  if (!ctx) throw new Error("useGender must be used within a GenderProvider");
  return ctx;
}
