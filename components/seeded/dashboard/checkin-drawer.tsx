"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { Drawer } from "@/components/ui/drawer";
import { SeededButton } from "@/components/seeded/ui/button";
import { Toast } from "@/components/seeded/ui/toast";
import { calculateStreak, loadDailyCheckins, saveDailyCheckin, type DailyCheckin, type FocusArea } from "@/lib/db/plan";
import { localDateKey } from "@/lib/time";
import { cn, plural } from "@/lib/utils";
import { CheckinHeatmap } from "./checkin-heatmap";

export const FOCUS_AREAS: { id: FocusArea; label: string }[] = [
  { id: "forehand", label: "Forehand" },
  { id: "backhand", label: "Backhand" },
  { id: "serve", label: "Serve" },
  { id: "fitness", label: "Fitness" },
  { id: "mental", label: "Mental" },
  { id: "match play", label: "Match play" },
  { id: "recovery", label: "Recovery" },
];

export const FOCUS_LABEL = new Map(FOCUS_AREAS.map((f) => [f.id, f.label]));

// Today's check-in, as ONE drawer. It used to be the whole dashboard card
// dropped inside a drawer: a card in a card, a heatmap in a fixed 220px
// column whose legend fell off the right, lowercase tags, a two-line notes
// box, a button whose label and icon changed after saving (the jump), and no
// word that it had saved.
//
// Now: labelled fields, a full-width heatmap that fits 320px, a real notes
// box, a save button whose size never changes, and a toast once it is saved.
// The drawer closes on save, so nothing below it re-flows.
export function CheckinDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ids = useId();
  const { data: checkins, mutate } = useSWR<DailyCheckin[]>("daily-checkins", () => loadDailyCheckins());
  const { mutate: mutateAny } = useSWRConfig();
  const [mood, setMood] = useState<number | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dismissSaved = useCallback(() => setSaved(false), []);

  const today = useMemo(() => (checkins ?? []).find((c) => c.date === localDateKey()), [checkins]);
  const streak = useMemo(() => calculateStreak(checkins ?? []), [checkins]);

  // Fill the form once per opening — from today's check-in if there is one —
  // never on a background revalidation, so typing is never overwritten.
  const [filledFor, setFilledFor] = useState(false);
  useEffect(() => {
    if (!open) {
      setFilledFor(false);
      return;
    }
    if (filledFor || checkins === undefined) return;
    setMood(today?.mood ?? null);
    setFocusAreas(today?.focusAreas ?? []);
    setNotes(today?.notes ?? "");
    setError("");
    setFilledFor(true);
  }, [open, filledFor, checkins, today]);

  const toggle = (area: FocusArea) =>
    setFocusAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));

  const submit = async () => {
    if (mood === null) {
      setError("Pick how training felt, 1 to 5.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const row = await saveDailyCheckin({ mood, focusAreas, notes: notes.trim() });
      if (!row) {
        setError("Sign in to save check-ins.");
        return;
      }
      await mutate((prev = []) => [...prev.filter((c) => c.date !== row.date), row].sort((a, b) => a.date.localeCompare(b.date)), {
        revalidate: false,
      });
      // The history page reads a longer window under its own key.
      void mutateAny((key) => typeof key === "string" && key.startsWith("daily-checkins-"));
      onClose();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your check-in. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={today ? "Update today's check-in" : "Daily check-in"}
        footer={
          <div>
            {error && (
              <p role="alert" className="mb-3 rounded-lg bg-error-bg px-3 py-2.5 text-sm text-error">
                {error}
              </p>
            )}
            <SeededButton className="w-full" onClick={() => void submit()} loading={saving}>
              Save check-in
            </SeededButton>
          </div>
        }
      >
        <div className="grid gap-6">
          <fieldset>
            <legend className="text-sm font-medium text-ink">How did training feel today?</legend>
            <p className="mt-0.5 text-sm text-stone">1 is rough, 5 is great.</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex h-11 cursor-pointer items-center justify-center rounded-lg border text-base font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                    mood === value ? "border-grass bg-grass-50 text-grass" : "border-input bg-card text-stone hover:text-ink"
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-mood`}
                    value={value}
                    checked={mood === value}
                    onChange={() => setMood(value)}
                    className="sr-only"
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-ink">
              What did you work on? <span className="font-normal text-stone">(optional)</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {FOCUS_AREAS.map((f) => {
                const on = focusAreas.includes(f.id);
                return (
                  <label
                    key={f.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center rounded-pill border px-3.5 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                      on ? "border-grass bg-grass-50 text-grass" : "border-input bg-card text-stone hover:text-ink"
                    )}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(f.id)} className="sr-only" />
                    {f.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor={`${ids}-notes`} className="text-sm font-medium text-ink">
              Notes <span className="font-normal text-stone">(optional)</span>
            </label>
            <textarea
              id={`${ids}-notes`}
              rows={4}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. energy, soreness, what clicked"
              className="mt-1.5 min-h-[112px] w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base text-ink placeholder:text-stone-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </div>

          <section aria-labelledby={`${ids}-recent`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`${ids}-recent`} className="text-sm font-medium text-ink">
                Last 30 days
              </h3>
              <span className="text-sm text-stone">
                {streak > 0 ? `${plural(streak, "day", "days")} in a row` : "No streak yet"}
              </span>
            </div>
            {checkins === undefined ? (
              <div className="mt-3 aspect-[10/3] w-full animate-pulse rounded-md bg-line/50 motion-reduce:animate-none" aria-hidden />
            ) : (
              <CheckinHeatmap checkins={checkins} className="mt-3" />
            )}
            <Link href="/today/check-ins" onClick={onClose} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-grass underline">
              All check-ins
            </Link>
          </section>
        </div>
      </Drawer>
      <Toast open={saved} onDismiss={dismissSaved} variant="success">
        Check-in saved.
      </Toast>
    </>
  );
}
