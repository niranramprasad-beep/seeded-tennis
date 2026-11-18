"use client";

import { useId, useState } from "react";
import { useSWRConfig } from "swr";
import { saveMatch, type MatchRecord } from "@/lib/db/events";
import { SeededButton } from "@/components/seeded/ui/button";
import { localDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";

const SURFACES: MatchRecord["surface"][] = ["hard", "clay", "grass", "indoor"];
const SURFACE_LABEL: Record<MatchRecord["surface"], string> = {
  hard: "Hard",
  clay: "Clay",
  grass: "Grass",
  indoor: "Indoor",
};

const fieldClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-ink placeholder:text-stone-light sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const areaClass =
  "min-h-[88px] w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base text-ink placeholder:text-stone-light sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const labelClass = "mb-1.5 block text-sm font-medium text-ink";

function blankForm() {
  return {
    matchDate: localDateKey(),
    result: "win" as "win" | "loss",
    opponent: "",
    opponentUtr: "",
    tournamentName: "",
    score: "",
    surface: "hard" as MatchRecord["surface"],
    worked: "",
    needsWork: "",
    notes: "",
  };
}

// THE result form. /matches renders it beside the history, and /events'
// "Log a result" opens it in a drawer — the same component, so the two
// cannot drift (the Events button used to open Match mode's "Generate prep
// plan" screen instead).
//
// Every field has a real <label for>. Placeholders only ever say "e.g. …":
// a placeholder that looks like data ("8.2" in the opponent UTR box) reads
// as a value already entered.
export function MatchResultForm({
  onSaved,
  className,
}: {
  /** Called with the saved record — the caller shows the toast. */
  onSaved?: (match: MatchRecord) => void;
  className?: string;
}) {
  const ids = useId();
  const { mutate } = useSWRConfig();
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof ReturnType<typeof blankForm>>(key: K, value: ReturnType<typeof blankForm>[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.tournamentName.trim() && !form.opponent.trim() && !form.score.trim()) {
      setError("Add an opponent, an event or a score, so this is a real match record.");
      return;
    }
    const opponentUtr = form.opponentUtr.trim() ? Number(form.opponentUtr) : null;
    if (opponentUtr !== null && (!Number.isFinite(opponentUtr) || opponentUtr < 1 || opponentUtr > 16.5)) {
      setError("Opponent UTR must be between 1.00 and 16.50.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveMatch({
        matchDate: form.matchDate,
        opponent: form.opponent.trim(),
        opponentUtr,
        tournamentName: form.tournamentName.trim(),
        surface: form.surface,
        result: form.result,
        score: form.score.trim(),
        worked: form.worked.trim(),
        needsWork: form.needsWork.trim(),
        notes: form.notes.trim(),
      });
      if (!saved) {
        setError("Sign in to save results.");
        return;
      }
      await mutate(
        "matches",
        (prev: MatchRecord[] = []) =>
          [saved, ...prev.filter((m) => m.id !== saved.id)].sort((a, b) => b.matchDate.localeCompare(a.matchDate)),
        { revalidate: false }
      );
      setForm(blankForm());
      onSaved?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the result. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn("grid gap-4", className)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-date`} className={labelClass}>
            Date played
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            required
            value={form.matchDate}
            max={localDateKey()}
            onChange={(e) => set("matchDate", e.target.value)}
            className={fieldClass}
          />
        </div>
        <fieldset>
          <legend className={labelClass}>Result</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["win", "loss"] as const).map((r) => (
              <label
                key={r}
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  form.result === r ? "border-grass bg-grass-50 text-grass" : "border-input bg-card text-stone hover:text-ink"
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-result`}
                  value={r}
                  checked={form.result === r}
                  onChange={() => set("result", r)}
                  className="sr-only"
                />
                {r === "win" ? "Win" : "Loss"}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${ids}-opponent`} className={labelClass}>
            Opponent
          </label>
          <input
            id={`${ids}-opponent`}
            value={form.opponent}
            autoComplete="off"
            onChange={(e) => set("opponent", e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-utr`} className={labelClass}>
            Opponent UTR <span className="font-normal text-stone">(optional)</span>
          </label>
          <input
            id={`${ids}-utr`}
            type="number"
            inputMode="decimal"
            min={1}
            max={16.5}
            step={0.01}
            placeholder="e.g. 8.20"
            value={form.opponentUtr}
            onChange={(e) => set("opponentUtr", e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-score`} className={labelClass}>
            Score
          </label>
          <input
            id={`${ids}-score`}
            placeholder="e.g. 6-4, 6-3"
            value={form.score}
            autoComplete="off"
            onChange={(e) => set("score", e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-surface`} className={labelClass}>
            Surface
          </label>
          <select
            id={`${ids}-surface`}
            value={form.surface}
            onChange={(e) => set("surface", e.target.value as MatchRecord["surface"])}
            className={fieldClass}
          >
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {SURFACE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${ids}-event`} className={labelClass}>
          Event <span className="font-normal text-stone">(optional)</span>
        </label>
        <input
          id={`${ids}-event`}
          value={form.tournamentName}
          autoComplete="off"
          onChange={(e) => set("tournamentName", e.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor={`${ids}-worked`} className={labelClass}>
          What worked
        </label>
        <textarea id={`${ids}-worked`} rows={3} value={form.worked} onChange={(e) => set("worked", e.target.value)} className={areaClass} />
      </div>
      <div>
        <label htmlFor={`${ids}-needs`} className={labelClass}>
          What to work on
        </label>
        <textarea id={`${ids}-needs`} rows={3} value={form.needsWork} onChange={(e) => set("needsWork", e.target.value)} className={areaClass} />
      </div>
      <div>
        <label htmlFor={`${ids}-notes`} className={labelClass}>
          Other notes
        </label>
        <textarea id={`${ids}-notes`} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={areaClass} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-error-bg px-3 py-2.5 text-sm text-error">
          {error}
        </p>
      )}
      <SeededButton type="submit" loading={saving} className="w-full sm:w-auto sm:justify-self-start">
        Save result
      </SeededButton>
    </form>
  );
}
