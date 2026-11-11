"use client";

import { useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "@/components/shared/animated-number";
import type { UseWhatIfUtrResult } from "@/lib/hooks/use-what-if-utr";
import { cn } from "@/lib/utils";

interface WhatIfPanelProps extends UseWhatIfUtrResult {
  /** The calendar year of the senior-summer milestone, for the headline copy. */
  seniorSummerYear: number;
}

// Shared "what if my UTR is ___ by June {year}?" slider + pace toggle +
// reset, used identically on the Schools browser and Plan — one
// implementation so dragging/pace-switching behaves the same everywhere.
// The slider's live number follows components/shared/animated-number.tsx's
// own prefers-reduced-motion handling (reusing that component rather than
// re-implementing the check); the progress fill behind it gets the same
// treatment via framer-motion's useReducedMotion for the same reason
// components/seeded/ui/toast.tsx already uses that hook.
export function WhatIfPanel({
  hypotheticalUTR,
  activePaceMode,
  myPaceValue,
  plusPaceValue,
  minUTR,
  maxUTR,
  isAtRealCurrent,
  selectMyPace,
  selectPlusPace,
  setCustom,
  reset,
  seniorSummerYear,
}: WhatIfPanelProps) {
  const reduceMotion = useReducedMotion();
  const fillPct = Math.min(100, Math.max(0, ((hypotheticalUTR - minUTR) / (maxUTR - minUTR)) * 100));

  return (
    <div className="rounded-xl border border-line bg-card p-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink">
          What if my UTR is{" "}
          <span className="font-mono text-grass">
            <AnimatedNumber value={hypotheticalUTR} decimals={1} duration={reduceMotion ? 0 : 500} />
          </span>{" "}
          by June {seniorSummerYear}?
        </p>
        {!isAtRealCurrent && (
          <button onClick={reset} className="text-xs font-semibold text-grass">
            Reset
          </button>
        )}
      </div>

      {/* Decorative progress read, separate from the native slider below it
          (no appearance-none thumb-replacement hacks — too fragile across
          browsers for a component with no exact mockup spec to match). */}
      <div className="relative mt-3.5 h-1.5 rounded-pill bg-line" aria-hidden>
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-pill bg-grass-300",
            !reduceMotion && "transition-[width] duration-150 ease-out"
          )}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <input
        type="range"
        min={minUTR}
        max={maxUTR}
        step={0.1}
        value={hypotheticalUTR}
        onChange={(e) => setCustom(parseFloat(e.target.value))}
        aria-label={`Hypothetical UTR by June ${seniorSummerYear}`}
        className="mt-1.5 h-6 w-full cursor-pointer accent-grass"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* activePaceMode, not paceMode: nothing is lit until the player
            actually picks a pace (P1-FIT-2). */}
        <PaceButton
          active={activePaceMode === "mine"}
          disabled={myPaceValue == null}
          onClick={selectMyPace}
        >
          My pace
        </PaceButton>
        <PaceButton active={activePaceMode === "plus1.5"} onClick={selectPlusPace}>
          +1.5/yr
        </PaceButton>
        <label className="ml-1 flex items-center gap-1.5 text-xs font-medium text-stone">
          Custom
          <input
            type="number"
            step={0.1}
            min={minUTR}
            max={maxUTR}
            value={hypotheticalUTR.toFixed(1)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) setCustom(v);
            }}
            className={cn(
              "h-8 w-[64px] rounded-md border border-input bg-card px-2 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30",
              activePaceMode === "custom" && "border-grass"
            )}
          />
        </label>
      </div>

      {myPaceValue == null && (
        <p className="mt-2 text-xs text-stone-light">
          Log 3+ UTR results to unlock your real regression-derived pace.
        </p>
      )}
    </div>
  );
}

function PaceButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center whitespace-nowrap rounded-pill border px-3 text-[13px] font-semibold transition-colors",
        active ? "border-grass bg-grass-50 text-grass" : "border-line bg-card text-stone",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      {children}
    </button>
  );
}
