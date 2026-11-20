"use client";

import { useEffect, useId, useState } from "react";
import {
  isCalendarDateKey,
  saveTournamentEntry,
  validateTournamentEntryInput,
  type NewTournamentEntryInput,
  type TournamentEntry,
} from "@/lib/db/events";
import { LEVELS, UTR_MAX, UTR_MIN, type FitLevel } from "@/lib/tournament-fit";
import { SeededButton } from "@/components/seeded/ui/button";
import { SeededDialog } from "@/components/seeded/ui/dialog";

const fieldClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const labelClass = "mb-1.5 block text-sm font-medium text-ink";
const optional = <span className="font-normal text-stone">(optional)</span>;

/** "" → null; anything else → the number (NaN stays NaN so validation can name it). */
function numOrNull(v: string): number | null {
  return v.trim() === "" ? null : Number(v);
}
function str(n: number | null): string {
  return n == null ? "" : String(n);
}

// Edit a saved tournament on /events. Every field the row stores and the
// verdict reads — including the draw's average UTR, without which there is
// no verdict (lib/tournament-fit.ts). City and state are optional. Status is
// NOT here: it has its own control on the row, and an edit never changes it
// (buildTournamentEntryRow omits status on an update).
export function TournamentEntryDialog({
  entry,
  onClose,
  onSaved,
}: {
  /** The entry being edited; null = closed. */
  entry: TournamentEntry | null;
  onClose: () => void;
  onSaved: (saved: TournamentEntry) => void;
}) {
  const ids = useId();
  const [name, setName] = useState("");
  const [level, setLevel] = useState<FitLevel>("L5");
  const [eventDate, setEventDate] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [entryCost, setEntryCost] = useState("");
  const [travelCost, setTravelCost] = useState("");
  const [travelHours, setTravelHours] = useState("");
  const [drawUtr, setDrawUtr] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setLevel(entry.level);
    setEventDate(entry.eventDate.slice(0, 10));
    setCity(entry.city);
    setState(entry.state);
    setEntryCost(str(entry.entryCost));
    setTravelCost(str(entry.travelCost));
    setTravelHours(str(entry.travelHours));
    setDrawUtr(str(entry.drawUtr));
    setError("");
    setSaving(false);
  }, [entry]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    const input: NewTournamentEntryInput & { id: string } = {
      id: entry.id,
      name,
      level,
      eventDate,
      city,
      state,
      entryCost: numOrNull(entryCost),
      travelCost: numOrNull(travelCost),
      travelHours: numOrNull(travelHours),
      distanceMiles: entry.distanceMiles,
      drawUtr: numOrNull(drawUtr),
      goalUtr: entry.goalUtr,
    };
    const invalid = !isCalendarDateKey(eventDate) ? "Enter a valid tournament date." : validateTournamentEntryInput(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(await saveTournamentEntry(input));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save this tournament. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SeededDialog
      open={!!entry}
      onClose={onClose}
      title="Edit tournament"
      footer={
        <>
          <SeededButton variant="secondary" type="button" onClick={onClose}>
            Cancel
          </SeededButton>
          <SeededButton type="submit" form={`${ids}-form`} loading={saving}>
            Save
          </SeededButton>
        </>
      }
    >
      <form id={`${ids}-form`} onSubmit={submit} noValidate className="grid gap-4">
        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            Tournament name
          </label>
          <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-date`} className={labelClass}>
              Date
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-level`} className={labelClass}>
              Level
            </label>
            <select
              id={`${ids}-level`}
              value={level}
              onChange={(e) => setLevel(e.target.value as FitLevel)}
              className={fieldClass}
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-city`} className={labelClass}>
              City {optional}
            </label>
            <input
              id={`${ids}-city`}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-state`} className={labelClass}>
              State {optional}
            </label>
            <input
              id={`${ids}-state`}
              value={state}
              onChange={(e) => setState(e.target.value)}
              autoComplete="address-level1"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-draw`} className={labelClass}>
              Draw&apos;s average UTR {optional}
            </label>
            <input
              id={`${ids}-draw`}
              type="number"
              inputMode="decimal"
              min={UTR_MIN}
              max={UTR_MAX}
              step="0.01"
              value={drawUtr}
              onChange={(e) => setDrawUtr(e.target.value)}
              className={fieldClass}
              aria-describedby={`${ids}-draw-hint`}
            />
            <p id={`${ids}-draw-hint`} className="mt-1.5 text-sm text-stone">
              Needed for a verdict. From the entry list or last year&apos;s draw.
            </p>
          </div>
          <div>
            <label htmlFor={`${ids}-hours`} className={labelClass}>
              Travel, hours one way {optional}
            </label>
            <input
              id={`${ids}-hours`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.25"
              value={travelHours}
              onChange={(e) => setTravelHours(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-entry`} className={labelClass}>
              Entry fee ($)
            </label>
            <input
              id={`${ids}-entry`}
              type="number"
              inputMode="decimal"
              min={0}
              value={entryCost}
              onChange={(e) => setEntryCost(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-travel`} className={labelClass}>
              Travel cost ($) {optional}
            </label>
            <input
              id={`${ids}-travel`}
              type="number"
              inputMode="decimal"
              min={0}
              value={travelCost}
              onChange={(e) => setTravelCost(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
            {error}
          </p>
        )}
      </form>
    </SeededDialog>
  );
}
