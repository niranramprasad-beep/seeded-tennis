"use client";

import { useEffect, useId, useState } from "react";
import {
  isCalendarDateKey,
  saveTournamentEntry,
  tournamentEntryProblem,
  type NewTournamentEntryInput,
  type TournamentEntry,
  type TournamentEntryField,
  type TournamentEntryProblem,
} from "@/lib/db/events";
import { LEVELS, UTR_MAX, UTR_MIN, type FitLevel } from "@/lib/tournament-fit";
import { SeededButton } from "@/components/seeded/ui/button";
import { SeededDialog } from "@/components/seeded/ui/dialog";
import { cn } from "@/lib/utils";

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

/** The id suffix of each input a problem can point at. A problem about a
 *  field this dialog has no input for (goal UTR, distance) stays in the box
 *  above the buttons. */
const FIELD_ID: Partial<Record<TournamentEntryField, string>> = {
  name: "name",
  level: "level",
  eventDate: "date",
  drawUtr: "draw",
  travelHours: "hours",
  entryCost: "entry",
  travelCost: "travel",
};

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
  // The problem with one input: marked invalid, its message beside it, focus on it.
  const [problem, setProblem] = useState<TournamentEntryProblem | null>(null);
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
    setProblem(null);
    setSaving(false);
  }, [entry]);

  const invalid = (key: TournamentEntryField) => problem?.field === key;
  // aria-invalid, and aria-describedby pointing at the field's message (after
  // the field's own hint, if it has one).
  const describe = (key: TournamentEntryField, hintId?: string) => {
    const describedBy = [hintId, invalid(key) ? `${ids}-${FIELD_ID[key]}-error` : undefined].filter(Boolean).join(" ");
    return { "aria-invalid": invalid(key) ? (true as const) : undefined, "aria-describedby": describedBy || undefined };
  };
  const messageFor = (key: TournamentEntryField) =>
    invalid(key) ? (
      <p id={`${ids}-${FIELD_ID[key]}-error`} role="alert" className="mt-1.5 text-sm text-error">
        {problem?.message}
      </p>
    ) : null;
  const edited = (key: TournamentEntryField, set: (value: string) => void) => (value: string) => {
    set(value);
    if (problem?.field === key) setProblem(null);
  };

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
    const found: TournamentEntryProblem | null = !isCalendarDateKey(eventDate)
      ? { field: "eventDate", message: "Enter a valid tournament date." }
      : tournamentEntryProblem(input);
    if (found) {
      const inputId = FIELD_ID[found.field];
      if (inputId) {
        // Mark the input, put the message under it and move focus to it.
        setError("");
        setProblem(found);
        document.getElementById(`${ids}-${inputId}`)?.focus();
      } else {
        setProblem(null);
        setError(found.message);
      }
      return;
    }
    setSaving(true);
    setError("");
    setProblem(null);
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
          <input
            id={`${ids}-name`}
            value={name}
            onChange={(e) => edited("name", setName)(e.target.value)}
            className={cn(fieldClass, invalid("name") && "border-error")}
            {...describe("name")}
          />
          {messageFor("name")}
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
              onChange={(e) => edited("eventDate", setEventDate)(e.target.value)}
              className={cn(fieldClass, invalid("eventDate") && "border-error")}
              {...describe("eventDate")}
            />
            {messageFor("eventDate")}
          </div>
          <div>
            <label htmlFor={`${ids}-level`} className={labelClass}>
              Level
            </label>
            <select
              id={`${ids}-level`}
              value={level}
              onChange={(e) => {
                setLevel(e.target.value as FitLevel);
                if (problem?.field === "level") setProblem(null);
              }}
              className={cn(fieldClass, invalid("level") && "border-error")}
              {...describe("level")}
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            {messageFor("level")}
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
              onChange={(e) => edited("drawUtr", setDrawUtr)(e.target.value)}
              className={cn(fieldClass, invalid("drawUtr") && "border-error")}
              {...describe("drawUtr", `${ids}-draw-hint`)}
            />
            <p id={`${ids}-draw-hint`} className="mt-1.5 text-sm text-stone">
              Needed for a verdict. From the entry list or last year&apos;s draw.
            </p>
            {messageFor("drawUtr")}
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
              onChange={(e) => edited("travelHours", setTravelHours)(e.target.value)}
              className={cn(fieldClass, invalid("travelHours") && "border-error")}
              {...describe("travelHours")}
            />
            {messageFor("travelHours")}
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
              onChange={(e) => edited("entryCost", setEntryCost)(e.target.value)}
              className={cn(fieldClass, invalid("entryCost") && "border-error")}
              {...describe("entryCost")}
            />
            {messageFor("entryCost")}
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
              onChange={(e) => edited("travelCost", setTravelCost)(e.target.value)}
              className={cn(fieldClass, invalid("travelCost") && "border-error")}
              {...describe("travelCost")}
            />
            {messageFor("travelCost")}
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
