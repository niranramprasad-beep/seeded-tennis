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
  /** True once the visitor has actually picked a side themselves. */
  isExplicit: boolean;
}

import { usePlayer } from "@/lib/context/player-context";

const GenderContext = createContext<GenderContextValue | null>(null);

// Browse preference (men's vs women's listings). Separate from the player's own
// gender so anyone can explore either side.
export function GenderProvider({ children }: { children: ReactNode }) {
  const [gender, setGenderState] = useState<Gender>("men");
  // Tracks whether the current value came from the visitor (stored choice)
  // or is still the untouched default, so seeding from the profile can
  // never overwrite a real preference.
  const [chosen, setChosen] = useState(false);
  const { player, isAuthed } = usePlayer();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(GENDER_KEY) as Gender | null;
      if (stored === "men" || stored === "women") {
        setGenderState(stored);
        setChosen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // A signed-in player with no stored preference gets their own side of the
  // catalogue. The default was a hard "men", and nothing ever consulted the
  // profile — so a women's player opened /schools to "37 men's programs",
  // and after the parent-view fix her parent's page said "Sorted by fit for
  // Bailey · 37 men's programs" while banding her 9.40 against men's
  // rosters. /onboarding and the homepage used her real gender all along,
  // so the two halves of the product disagreed about who she was.
  useEffect(() => {
    if (chosen || !isAuthed) return;
    if (player.gender === "female") setGenderState("women");
    else if (player.gender === "male") setGenderState("men");
  }, [chosen, isAuthed, player.gender]);

  const setGender = useCallback((g: Gender) => {
    setGenderState(g);
    // An explicit toggle wins over the profile seed for ever after.
    setChosen(true);
    try {
      window.localStorage.setItem(GENDER_KEY, g);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ gender, setGender, isExplicit: chosen }),
    [gender, setGender, chosen]
  );
  return <GenderContext.Provider value={value}>{children}</GenderContext.Provider>;
}

export function useGender() {
  const ctx = useContext(GenderContext);
  if (!ctx) throw new Error("useGender must be used within a GenderProvider");
  return ctx;
}
