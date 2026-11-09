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
  whatIfProjectionFor,
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
  paceMode: WhatIfPaceMode;
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
   * in place of the real projection whenever the what-if value is in play. */
  whatIfProjection: SchoolFitProjectionInput | undefined;
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

  // Mount default mirrors Reset's target state exactly — opening this
  // panel never silently changes what the rest of the page already shows;
  // it only starts reacting once the player actually touches it.
  const [paceMode, setPaceMode] = useState<WhatIfPaceMode>(defaultMode);
  const [hypotheticalUTR, setHypotheticalUTR] = useState<number>(currentUTR);

  const selectMyPace = () => {
    if (myPaceValue == null) return;
    setPaceMode("mine");
    setHypotheticalUTR(myPaceValue);
  };

  const selectPlusPace = () => {
    setPaceMode("plus1.5");
    setHypotheticalUTR(plusPaceValue);
  };

  const setCustom = (value: number) => {
    setPaceMode("custom");
    setHypotheticalUTR(clampToRealisticUtr(value, gender));
  };

  const reset = () => {
    setPaceMode(defaultMode);
    setHypotheticalUTR(currentUTR);
  };

  const whatIfProjection = whatIfProjectionFor(paceMode, {
    utrHistory,
    graduationYear,
    gender,
  });

  return {
    hypotheticalUTR,
    paceMode,
    myPaceValue,
    plusPaceValue,
    minUTR: REALISTIC_UTR_FLOOR,
    maxUTR: REALISTIC_UTR_CEILING[gender],
    isAtRealCurrent: paceMode === defaultMode && hypotheticalUTR === currentUTR,
    selectMyPace,
    selectPlusPace,
    setCustom,
    reset,
    whatIfProjection,
  };
}
