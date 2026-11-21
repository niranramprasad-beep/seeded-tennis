"use client";

import { useState } from "react";
import { planGoalInputError, type PlanGoal } from "@/lib/fit";
import { SeededButton } from "@/components/seeded/ui/button";
import { formatPlayerUtr, formatTargetUtr } from "@/lib/utils";

// Sets the plan goal explicitly (C11). Saved with lib/db/settings.ts
// savePlanGoalUtr via usePlanGoal. There is no default goal (PR D, D1): the
// planning estimate is OFFERED as a goal ("Use your estimate (8.10)"), saved
// only when the player picks it, and "Clear goal" goes back to no goal.
export function PlanGoalEditor({
  goal,
  estimate,
  currentUtr,
  onSave,
  onCancel,
  className,
}: {
  /** Null when no goal is set yet — the editor then starts empty. */
  goal: PlanGoal | null;
  /** The fit report's planning estimate, offered as a goal. Null when there
   * is no projection. */
  estimate: number | null;
  /** Today's rating; a goal must be above it (docs/DECISIONS.md). Null or
   * the 0 sentinel when the player has none — then any 1–16.5 goal is fine. */
  currentUtr: number | null;
  onSave: (value: number | null) => Promise<void>;
  onCancel: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(goal ? formatPlayerUtr(goal.value) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (value: number | null) => {
    setSaving(true);
    setError("");
    try {
      await onSave(value);
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    const v = Number(draft);
    // Range, and above today's rating (lib/fit.ts planGoalInputError).
    const problem = planGoalInputError(v, currentUtr);
    if (problem) {
      setError(problem);
      return;
    }
    void save(Math.round(v * 100) / 100);
  };

  return (
    <div className={`rounded-xl border border-line bg-panel p-4 ${className ?? ""}`}>
      <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
        <span className="font-semibold">Your goal by the summer before senior year</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={16.5}
          step={0.01}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="h-11 w-24 rounded-md border border-input bg-card px-2 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus sm:h-9"
        />
      </label>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SeededButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save goal"}
        </SeededButton>
        {estimate != null && estimate !== goal?.value && planGoalInputError(estimate, currentUtr) == null && (
          <SeededButton variant="secondary" onClick={() => void save(estimate)} disabled={saving}>
            Use your estimate ({formatTargetUtr(estimate)})
          </SeededButton>
        )}
        {goal && (
          <SeededButton variant="secondary" onClick={() => void save(null)} disabled={saving}>
            Clear goal
          </SeededButton>
        )}
        <button type="button" onClick={onCancel} className="min-h-11 px-2 text-sm font-semibold text-stone hover:text-ink sm:min-h-8">
          Cancel
        </button>
      </div>
    </div>
  );
}
