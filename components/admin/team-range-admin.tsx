"use client";

// The owner's form for adding a team UTR range to an imported program
// (migration 048). Every range needs a source type, a source, and the date
// the source was read; the database re-checks all of it and refuses anyone
// who is not in app_admins. Ranges are never edited or deleted from here —
// a correction is a newer range, and the newest one is current.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  currentRange,
  formatIsoDate,
  RANGE_SOURCE_TYPE_LABEL,
  RANGE_SOURCE_TYPES,
  type ImportedProgram,
  type RangeSourceType,
} from "@/lib/catalog/programs";
import { insertTeamRange, isAppAdmin, loadImportedPrograms, teamRangeInputError } from "@/lib/db/programs";
import { toLocalDateString } from "@/lib/time";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Gate = "loading" | "unconfigured" | "signed-out" | "not-admin" | "admin";

const field =
  "h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30";
const label = "block text-sm font-medium text-ink";

export function TeamRangeAdmin() {
  const [gate, setGate] = useState<Gate>("loading");
  const [programs, setPrograms] = useState<ImportedProgram[]>([]);
  const [programId, setProgramId] = useState("");
  const [low, setLow] = useState("");
  const [middle, setMiddle] = useState("");
  const [high, setHigh] = useState("");
  const [sourceType, setSourceType] = useState<RangeSourceType>("hand_curated");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const today = toLocalDateString();

  const reload = useCallback(async () => {
    const supa = getSupabase();
    if (!supa) return;
    setPrograms(await loadImportedPrograms(supa));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supa = getSupabase();
      if (!supa) return setGate("unconfigured");
      const { data } = await supa.auth.getSession();
      if (!data.session) return !cancelled && setGate("signed-out");
      const admin = await isAppAdmin(supa);
      if (cancelled) return;
      if (!admin) return setGate("not-admin");
      setGate("admin");
      await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const selected = useMemo(() => programs.find((p) => p.id === programId) ?? null, [programs, programId]);
  const selectedRange = selected ? currentRange(selected) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const input = {
      programId,
      low: Number.parseFloat(low),
      middle: Number.parseFloat(middle),
      high: Number.parseFloat(high),
      sourceType,
      source,
      sourceUrl: sourceUrl.trim() || null,
      sourceDate,
    };
    const problem = teamRangeInputError(input, today);
    if (problem) return setMessage({ kind: "error", text: problem });
    const supa = getSupabase();
    if (!supa) return setMessage({ kind: "error", text: "Supabase is not configured." });
    setSaving(true);
    const { error } = await insertTeamRange(supa, input);
    setSaving(false);
    if (error) return setMessage({ kind: "error", text: error });
    setMessage({ kind: "ok", text: "Saved. It is now the current range for this program." });
    setLow("");
    setMiddle("");
    setHigh("");
    await reload();
  }

  let body: React.ReactNode;
  if (gate === "loading") body = <p className="text-stone">Checking your account…</p>;
  else if (gate === "unconfigured") body = <p className="text-stone">Supabase is not configured here.</p>;
  else if (gate === "signed-out")
    body = (
      <p className="text-stone">
        Sign in first.{" "}
        <Link className="underline" href="/login">
          Go to sign in
        </Link>
      </p>
    );
  else if (gate === "not-admin") body = <p className="text-stone">This page is for the app owner only.</p>;
  else
    body = (
      <form onSubmit={submit} className="mt-6 max-w-xl space-y-5" noValidate>
        <div>
          <label htmlFor="tr-program" className={label}>
            Program
          </label>
          <select id="tr-program" className={`${field} mt-1.5`} value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">Choose a program…</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.school} · {p.gender === "women" ? "Women's" : "Men's"} · {p.conference}
              </option>
            ))}
          </select>
          {selected ? (
            <p className="mt-1.5 text-xs text-stone">
              {selectedRange
                ? `Current range ${selectedRange.low.toFixed(2)}–${selectedRange.high.toFixed(2)} (middle ${selectedRange.middle.toFixed(2)}), ${RANGE_SOURCE_TYPE_LABEL[selectedRange.sourceType].toLowerCase()}, ${formatIsoDate(selectedRange.sourceDate)}. A new range replaces it as current; the old one is kept.`
                : "No range yet: this program reads “Level not rated yet”."}
            </p>
          ) : null}
        </div>

        <fieldset>
          <legend className={label}>Team UTR range</legend>
          <p className="mt-1 text-xs text-stone">
            Low is the competitive floor (the Target line), middle the team median (the Likely line).
          </p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <NumberField id="tr-low" text="Low" value={low} onChange={setLow} />
            <NumberField id="tr-middle" text="Middle" value={middle} onChange={setMiddle} />
            <NumberField id="tr-high" text="High" value={high} onChange={setHigh} />
          </div>
        </fieldset>

        <div>
          <label htmlFor="tr-source-type" className={label}>
            Where it came from
          </label>
          <select
            id="tr-source-type"
            className={`${field} mt-1.5`}
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as RangeSourceType)}
          >
            {RANGE_SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RANGE_SOURCE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tr-source" className={label}>
            Source
          </label>
          <input
            id="tr-source"
            className={`${field} mt-1.5`}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="What you read, in a few words"
          />
          <p className="mt-1 text-xs text-stone">Shown to families beside the range.</p>
        </div>

        <div>
          <label htmlFor="tr-source-url" className={label}>
            Source link (optional)
          </label>
          <input
            id="tr-source-url"
            className={`${field} mt-1.5`}
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://"
          />
        </div>

        <div>
          <label htmlFor="tr-source-date" className={label}>
            Date the source was read
          </label>
          <input
            id="tr-source-date"
            className={`${field} mt-1.5`}
            type="date"
            max={today}
            value={sourceDate}
            onChange={(e) => setSourceDate(e.target.value)}
          />
        </div>

        {message ? (
          <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-ink" : "text-sm text-grass"}>
            {message.text}
          </p>
        ) : null}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add range"}
        </Button>
      </form>
    );

  return (
    <main className="mx-auto max-w-content container-px py-10">
      <h1 className="text-2xl font-light tracking-tight text-ink">Team ranges</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone">
        Add a sourced team UTR range to an imported program. Until a program has one it reads
        &ldquo;Level not rated yet&rdquo; and gets no fit band. Ranges are never fetched or estimated
        by the app.
      </p>
      {body}
    </main>
  );
}

function NumberField({
  id,
  text,
  value,
  onChange,
}: {
  id: string;
  text: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-stone">
        {text}
      </label>
      <input
        id={id}
        className={`${field} mt-1`}
        inputMode="decimal"
        type="number"
        min={1}
        max={16.5}
        step={0.01}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
