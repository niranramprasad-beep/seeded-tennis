"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { localDateKey } from "@/lib/time";
import type { MatchRecord } from "@/lib/supabase/features";

const SURFACES: MatchRecord["surface"][] = ["hard", "clay", "grass", "indoor"];

export interface SundayCheckinMatchInput {
  matchDate: string;
  surface: MatchRecord["surface"];
  result: "win" | "loss";
  score: string;
  opponent: string;
}

export interface SundayCheckinSaveInput {
  utr: number;
  recordedAt: string;
  match: SundayCheckinMatchInput | null;
}

// A single fast drawer for the "Sunday check-in" nudge on /today
// (lib/today-actions.ts's isSundayCheckinDue decides when it's actually
// shown). Deliberately writes through the SAME real functions the rest of
// the app already uses for this data — createUtrEntry and saveMatch (both
// in lib/supabase/features.ts / lib/supabase/utr.ts) — rather than a third
// parallel data-entry path, so a submission here shows up in /plan's real
// UTR-vs-plan chart and match history for free. The UTR field alone is the
// common case (~10 seconds); the match section is optional and collapsed
// by default so it never adds friction when there's nothing to log.
export function SundayCheckinDrawer({
  open,
  currentUtr,
  loading,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  currentUtr: number;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: SundayCheckinSaveInput) => void;
}) {
  const [utr, setUtr] = useState(currentUtr.toFixed(1));
  const [logMatch, setLogMatch] = useState(false);
  const [matchDate, setMatchDate] = useState(localDateKey());
  const [result, setResult] = useState<"win" | "loss">("win");
  const [opponent, setOpponent] = useState("");
  const [score, setScore] = useState("");
  const [surface, setSurface] = useState<MatchRecord["surface"]>("hard");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUtr(currentUtr.toFixed(1));
    setLogMatch(false);
    setMatchDate(localDateKey());
    setResult("win");
    setOpponent("");
    setScore("");
    setSurface("hard");
    setLocalError("");
  }, [currentUtr, open]);

  const submit = () => {
    const utrValue = Number(utr);
    if (!Number.isFinite(utrValue) || utrValue < 1 || utrValue > 16.5) {
      setLocalError("Enter a UTR between 1.00 and 16.50.");
      return;
    }
    if (logMatch && !matchDate) {
      setLocalError("Choose the date you played that match.");
      return;
    }
    onSave({
      utr: utrValue,
      recordedAt: localDateKey(),
      match: logMatch
        ? { matchDate, surface, result, score: score.trim(), opponent: opponent.trim() }
        : null,
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Sunday check-in"
      title="2-minute weekly update"
      footer={
        <Button className="w-full" onClick={submit} disabled={loading}>
          {loading ? "Saving..." : "Save check-in"}
          <Check className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-stone">
          Update your UTR, and log a match if you played one this week — both feed straight into your plan.
        </p>
        {(localError || error) && (
          <p className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
            {localError || error}
          </p>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-light">Current UTR</span>
          <input
            type="number"
            min={1}
            max={16.5}
            step={0.01}
            value={utr}
            onChange={(event) => setUtr(event.target.value)}
            className="h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
          />
        </label>

        {!logMatch ? (
          <button
            onClick={() => setLogMatch(true)}
            className="text-sm font-semibold text-grass hover:text-grass-600"
          >
            + Log a match result from this week (optional)
          </button>
        ) : (
          <div className="space-y-4 rounded-xl border-[0.5px] border-line bg-cream/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Match result</span>
              <button
                onClick={() => setLogMatch(false)}
                className="text-xs font-semibold text-stone hover:text-ink"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["win", "loss"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setResult(r)}
                  className={
                    result === r
                      ? "h-11 rounded-xl border border-grass bg-grass text-sm font-semibold text-on-primary"
                      : "h-11 rounded-xl border border-line bg-card text-sm font-semibold text-ink"
                  }
                >
                  {r === "win" ? "Win" : "Loss"}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-stone-light">Date played</span>
              <input
                type="date"
                value={matchDate}
                onChange={(event) => setMatchDate(event.target.value)}
                className="h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-stone-light">Opponent (optional)</span>
                <input
                  value={opponent}
                  onChange={(event) => setOpponent(event.target.value)}
                  className="h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-stone-light">Score (optional)</span>
                <input
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                  placeholder="6-4, 6-2"
                  className="h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-stone-light">Surface</span>
              <select
                value={surface}
                onChange={(event) => setSurface(event.target.value as MatchRecord["surface"])}
                className="h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-3 text-sm capitalize text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
              >
                {SURFACES.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    </Drawer>
  );
}
