"use client";

// React state wrapper around lib/what-if-utr.ts's pure math — shared by
// the Schools browser and Plan so the slider/pace-toggle/reset behave
// identically on both pages. Owns exactly the two pieces of state the UI
// needs (the hypothetical UTR, and which pace produced it); everything
// else is derived from lib/what-if-utr.ts on every render, not cached
// here, so it can never drift out of sync with a prop change (e.g. the
// player logging a new real UTR entry while this panel is open).
import { useState } from "react";
import type { PlayerGender } from "@/lib/types";
import type { UtrDataPoint } from "@/lib/utr-projection";
import type { SchoolFitProjectionInput } from "@/lib/school-fit";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import {
  clampToRealisticUtr,
  computeMyPaceUTR,
  computePlusPaceUTR,
  resolveWhatIfDisplay,
  whatIfProjectionFor,
  type WhatIfOverride,
  type WhatIfPaceMode,
} from "@/lib/what-if-utr";

const REALISTIC_UTR_FLOOR = 1.0;

export interface UseWhatIfUtrInput {
  currentUTR: number;
  graduationYear: number;
  gender: PlayerGender;
  utrHistory: UtrDataPoint[];
}

export interface UseWhatIfUtrResult {
  hypotheticalUTR: number;
  /** The effective mode driving the math. */
  paceMode: WhatIfPaceMode;
  /** What the UI should render as selected — null until the player picks a
   * pace, so no button is lit next to a number it didn't produce. */
  activePaceMode: WhatIfPaceMode | null;
  /** null when there are <3 real UTR entries — "My pace" has nothing real to compute from. */
  myPaceValue: number | null;
  plusPaceValue: number;
  minUTR: number;
  maxUTR: number;
  isAtRealCurrent: boolean;
  selectMyPace: () => void;
  selectPlusPace: () => void;
  /** Manual drag/typed entry — always flips the mode to "custom" since the
   * resulting value no longer necessarily matches either formula. */
  setCustom: (value: number) => void;
  reset: () => void;
  /** Feed this straight into classifySchoolFit/explainSchoolFit/countSchoolFits
   * in place of the real projection whenever the what-if value is in play.
   * Always defined (P1-FIT-1) — passing `undefined` makes classifySchoolFit
   * answer "reach" for every school below the team floor. */
  whatIfProjection: SchoolFitProjectionInput;
}

export function useWhatIfUtr({
  currentUTR,
  graduationYear,
  gender,
  utrHistory,
}: UseWhatIfUtrInput): UseWhatIfUtrResult {
  const myPaceValue = computeMyPaceUTR({ utrHistory, graduationYear, gender });
  const plusPaceValue = computePlusPaceUTR({ currentUTR, graduationYear, gender });
  const defaultMode: WhatIfPaceMode = myPaceValue != null ? "mine" : "plus1.5";

  // P1-FIT-2: this used to be `useState(currentUTR)` plus
  // `useState(defaultMode)`. Both were seeded on the FIRST render, which
  // happens before the player and their UTR history have loaded — so the
  // panel captured the placeholder `currentUTR: 7` (lib/auth.ts,
  // lib/data/user.ts) and the historyless default mode, then kept them.
  // Live symptom: a 5.81 player saw "You 7.0" on every row of /schools, and
  // "+1.5/yr" rendered as the selected pace while its value equalled their
  // current UTR.
  //
  // Rather than re-seeding from an effect (which re-introduces the same race
  // one tick later), nothing is stored until the player actually touches the
  // panel. Until then both values are DERIVED from the current props, so
  // they track the real player the moment it arrives. `override` is the
  // user's intent; absent it, the panel simply shows where they are.
  const [override, setOverride] = useState<WhatIfOverride | null>(null);

  const { hypotheticalUTR, paceMode, activePaceMode, isAtRealCurrent } =
    resolveWhatIfDisplay(override, { currentUTR, defaultMode });

  const selectMyPace = () => {
    if (myPaceValue == null) return;
    setOverride({ mode: "mine", utr: myPaceValue });
  };

  const selectPlusPace = () => {
    setOverride({ mode: "plus1.5", utr: plusPaceValue });
  };

  const setCustom = (value: number) => {
    setOverride({ mode: "custom", utr: clampToRealisticUtr(value, gender) });
  };

  // Back to deriving from props — which is also what the panel does before
  // it's ever touched, so Reset and mount are the same state by definition.
  const reset = () => setOverride(null);

  const realProjection: SchoolFitProjectionInput = { utrHistory, graduationYear, gender };

  // Untouched, this page is showing the player's actual situation — so it
  // must use the player's actual projection, which is exactly what /plan,
  // school detail, Today, Outreach and Family pass. That makes "the Schools
  // browser agrees with every other screen" true by construction rather than
  // by coincidence, which is the whole of P1-FIT-1's acceptance criterion.
  const whatIfProjection = override
    ? whatIfProjectionFor(override.mode, realProjection, { currentUTR, hypotheticalUTR })
    : realProjection;

  return {
    hypotheticalUTR,
    paceMode,
    myPaceValue,
    plusPaceValue,
    activePaceMode,
    minUTR: REALISTIC_UTR_FLOOR,
    maxUTR: REALISTIC_UTR_CEILING[gender],
    isAtRealCurrent,
    selectMyPace,
    selectPlusPace,
    setCustom,
    reset,
    whatIfProjection,
  };
}
