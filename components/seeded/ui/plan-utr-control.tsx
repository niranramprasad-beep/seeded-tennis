"use client";

import { useState } from "react";
import { planGoalInputError } from "@/lib/fit";
import { SeededButton } from "@/components/seeded/ui/button";
import { cn, formatPlayerUtr, formatTargetUtr } from "@/lib/utils";

/**
 * "Set your plan UTR" (2026-11-27). It replaced the unlabeled "What if my
 * UTR is ___ by June {year}?" slider on /schools and the goal editor on
 * /plan: ONE stored number (lib/hooks/use-plan-utr.ts) that every fit screen
 * judges on — Schools, Plan, Today, a school page, the tournament checker.
 * Saving it here updates all of them (one SWR key, optimistic).
 *
 * Nothing is saved until the player presses Save: the slider and the box
 * only change the draft, so dragging never rewrites the stored value.
 * There is no default plan: the estimate is OFFERED ("Use my estimate"),
 * never applied on its own (PR D, D1).
 */
export function PlanUtrControl({
  planUtr,
  loaded,
  currentUtr,
  estimate,
  seniorSummerYear,
  minUtr = 1,
  maxUtr = 16.5,
  onSave,
  id = "plan-utr",
  className,
}: {
  /** The saved Plan UTR, null when none is set, undefined while loading. */
  planUtr: number | null | undefined;
  loaded: boolean;
  /** Today's real rating, or null. A plan must be above it (planGoalInputError). */
  currentUtr: number | null;
  /** The fit report's planning estimate, offered as a plan. Null without one. */
  estimate: number | null;
  /** The calendar year of the summer before senior year. */
  seniorSummerYear: number;
  minUtr?: number;
  maxUtr?: number;
  onSave: (value: number | null) => Promise<void>;
  id?: string;
  className?: string;
}) {
  const saved = planUtr ?? null;
  // The player's edit, or null while they have not touched it. Until then
  // the box shows the saved value, DERIVED — it arrives after the first
  // render (SWR) and can change on another screen, and a copy seeded on
  // mount would keep the stale one (the what-if panel's P1-FIT-2 lesson).
  const [edited, setEdited] = useState<string | null>(null);
  const draft = edited ?? (saved != null ? formatPlayerUtr(saved) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const when = `by June ${seniorSummerYear}`;
  const draftNum = Number(draft);
  const sliderValue = Number.isFinite(draftNum) && draft !== "" ? Math.min(maxUtr, Math.max(minUtr, draftNum)) : (currentUtr ?? minUtr);
  const unchanged = saved != null && draft !== "" && Math.round(draftNum * 100) === Math.round(saved * 100);

  const save = async (value: number | null) => {
    setSaving(true);
    setError("");
    setJustSaved(false);
    try {
      await onSave(value);
      setEdited(null);
      setJustSaved(true);
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    const problem = planGoalInputError(draftNum, currentUtr);
    if (draft === "" || problem) {
      setError(problem ?? "Enter a UTR between 1.00 and 16.50.");
      return;
    }
    void save(Math.round(draftNum * 100) / 100);
  };

  const edit = (value: string) => {
    setEdited(value);
    setError("");
    setJustSaved(false);
  };

  // A plan needs a real rating to plan from (activePlanUtr ignores one
  // without), and nothing to plan for once the summer before senior year
  // has begun — fit then uses today's rating (verifier HIGH 1 and 3).
  const datePassed = new Date() >= new Date(seniorSummerYear, 5, 1);
  if (currentUtr == null || datePassed) {
    return (
      <div className={cn("rounded-card border border-line bg-card p-[18px]", !loaded && "invisible", className)}>
        <p className="text-[15px] font-semibold text-ink">Set your plan UTR</p>
        <p className="mt-1 text-sm text-stone">
          {datePassed
            ? "The summer before senior year has started, so fit uses your UTR today. There's no plan date left to aim for."
            : "Log your UTR first. Your plan UTR is the rating you're aiming for from there."}
        </p>
        {/* A plan saved earlier stays clearable, though it no longer judges fit. */}
        {saved != null ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-stone">
            <span>
              Saved: <span className="font-mono tabular-nums text-ink">{formatPlayerUtr(saved)}</span> (not in use)
            </span>
            <SeededButton variant="secondary" onClick={() => void save(null)} disabled={saving}>
              Clear
            </SeededButton>
          </div>
        ) : null}
      </div>
    );
  }
  // A saved plan today's rating has reached no longer judges fit.
  const reached = saved != null && Math.round(saved * 100) <= Math.round(currentUtr * 100);

  const canOfferEstimate =
    estimate != null && (saved == null || Math.round(estimate * 100) !== Math.round(saved * 100)) && planGoalInputError(estimate, currentUtr) == null;

  return (
    <div className={cn("rounded-card border border-line bg-card p-[18px]", !loaded && "invisible", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={`${id}-input`} className="text-[15px] font-semibold text-ink">
          Set your plan UTR
        </label>
        <span className="text-[13px] text-stone" aria-live="polite">
          {saved != null ? (
            <>
              Saved: <span className="font-mono tabular-nums text-ink">{formatPlayerUtr(saved)}</span>{" "}
              {reached ? "· reached, so fit uses the estimate. Set a higher one." : when}
            </>
          ) : (
            "No plan UTR set"
          )}
        </span>
      </div>
      <p id={`${id}-help`} className="mt-1 text-sm text-stone">
        The UTR you&apos;re aiming for {when}, the summer before senior year. Your Schools, Plan, Today and
        tournament checker screens all use it. A parent&apos;s screens use your estimate.
      </p>

      {/* One track: the native slider's own, tinted with accent-color. 44px
          tall for a thumb on a phone (board 23 rule 8). It moves the draft
          only; Save stores it. */}
      <input
        type="range"
        min={minUtr}
        max={maxUtr}
        step={0.05}
        value={sliderValue}
        onChange={(e) => edit(formatPlayerUtr(parseFloat(e.target.value)))}
        aria-label={`Plan UTR ${when}`}
        aria-describedby={`${id}-help`}
        className="mt-3 h-11 w-full cursor-pointer accent-grass sm:h-8"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          id={`${id}-input`}
          type="number"
          inputMode="decimal"
          min={minUtr}
          max={maxUtr}
          step={0.01}
          value={draft}
          placeholder={currentUtr != null ? formatPlayerUtr(currentUtr) : "e.g. 10.50"}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          aria-describedby={`${id}-help`}
          className="h-11 w-[104px] rounded-md border border-input bg-card px-2 font-mono text-base text-ink focus:outline-none focus:ring-2 focus:ring-focus sm:h-9 sm:text-sm"
        />
        <SeededButton onClick={submit} disabled={saving || unchanged}>
          {saving ? "Saving…" : "Save plan UTR"}
        </SeededButton>
        {canOfferEstimate && (
          <SeededButton variant="secondary" onClick={() => void save(estimate as number)} disabled={saving}>
            Use my estimate ({formatTargetUtr(estimate as number)})
          </SeededButton>
        )}
        {saved != null && (
          <SeededButton variant="secondary" onClick={() => void save(null)} disabled={saving}>
            Clear
          </SeededButton>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : justSaved ? (
        <p role="status" className="mt-2 text-sm text-stone">
          Saved. Your screens now use it.
        </p>
      ) : null}
    </div>
  );
}
