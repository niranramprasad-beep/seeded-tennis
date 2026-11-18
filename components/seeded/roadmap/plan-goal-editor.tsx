"use client";

import { useState } from "react";
import type { PlanGoal } from "@/lib/fit";
import { SeededButton } from "@/components/seeded/ui/button";
import { formatPlayerUtr, formatUtrEstimate } from "@/lib/utils";

// Sets the plan goal explicitly (C11). Saved with lib/db/settings.ts
// savePlanGoalUtr via usePlanGoal; "Use the estimate" clears it, and the
// goal goes back to where typical growth puts the player (lib/fit.ts).
export function PlanGoalEditor({
  goal,
  onSave,
  onCancel,
  className,
}: {
  goal: PlanGoal;
  onSave: (value: number | null) => Promise<void>;
  onCancel: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(formatPlayerUtr(goal.value));
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
    if (!Number.isFinite(v) || v < 1 || v > 16.5) {
      setError("Enter a UTR between 1.00 and 16.50.");
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
        {goal.source === "chosen" && goal.estimate != null && (
          <SeededButton variant="secondary" onClick={() => void save(null)} disabled={saving}>
            Use the estimate ({formatUtrEstimate(goal.estimate)})
          </SeededButton>
        )}
        <button type="button" onClick={onCancel} className="min-h-11 px-2 text-sm font-semibold text-stone hover:text-ink sm:min-h-8">
          Cancel
        </button>
      </div>
    </div>
  );
}
