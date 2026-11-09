"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { loadUtrEntries } from "@/lib/supabase/utr";
import { saveTournamentEntry, type TournamentEntry } from "@/lib/supabase/tournaments";
import {
  evaluateTournamentFit,
  LEVELS,
  UTR_MAX,
  UTR_MIN,
  typicalFieldUtr,
  type FitLevel,
  type Verdict,
} from "@/lib/tournament-fit";
import {
  TRAVEL_PILLS,
  decodeTournamentFitShareParams,
  encodeTournamentFitShareParams,
  travelHoursForPill,
  type TravelPill,
} from "@/lib/tournament-fit-share";
import { SeededButton } from "@/components/seeded/ui/button";
import { Toast, type ToastVariant } from "@/components/seeded/ui/toast";
import { Drawer } from "@/components/ui/drawer";
import { localDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";

const inputClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

const VERDICT_META: Record<
  Verdict,
  { headline: string; card: string; eyebrow: string }
> = {
  // Colors measured directly off "14 Tournament fit finder.png"'s "Skip it"
  // example and reused for the other two states from the same card bg/text
  // family the rest of the Seeded redesign already uses for this exact
  // good/bad semantic (FitBadge's target/reach, UpcomingTournamentsCard's
  // good-fit/skip-it chips) — "decent" borrows DataChip's "estimated" amber,
  // the one existing three-way precedent in the design system.
  good: { headline: "Worth it", card: "border-grass-100 bg-grass-50 text-grass", eyebrow: "text-grass" },
  decent: { headline: "Worth a look", card: "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]", eyebrow: "text-[rgb(var(--c-gold-tint-text))]" },
  bad: { headline: "Skip it", card: "border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text-strong))]", eyebrow: "text-[rgb(var(--c-clay-tint-text-strong))]" },
};

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Pixel-exact to "14 Tournament fit finder.png" — a genuinely live
// calculator (no "get the verdict" submit step like the Legacy version
// below): every keystroke/pill click re-runs the real evaluateTournamentFit
// engine via useMemo. The mockup's form has no draw-strength or goal-UTR
// inputs at all, so drawUtr/goalUtr are always passed as null here — that's
// exactly the "estimate from level" path the engine already has, which is
// what the "Typical field for this level" note under the Level pills shows.
export function SeededTournamentFitView() {
  const { player, isAuthed, hydrated } = usePlayer();
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const searchParams = useSearchParams();

  // A /tournament-fit?... link is the entire "Share with my coach" feature
  // (see lib/tournament-fit-share.ts) — decode it once on mount so opening a
  // shared link reproduces the exact same check the sender ran.
  const [shared] = useState(() => decodeTournamentFitShareParams(searchParams));

  const [name, setName] = useState(shared.name ?? "");
  const [level, setLevel] = useState<FitLevel>(shared.level ?? "L4");
  const [travel, setTravel] = useState<TravelPill>(shared.travel ?? "local");
  const [entryCost, setEntryCost] = useState(shared.entryCost != null ? String(shared.entryCost) : "");
  const [travelCost, setTravelCost] = useState(shared.travelCost != null ? String(shared.travelCost) : "");
  const [utr, setUtr] = useState(shared.playerUtr != null ? shared.playerUtr.toFixed(1) : "");
  // A shared link's UTR is a deliberate snapshot — it should win over the
  // opener's own profile, same reasoning as a manual edit.
  const [utrTouched, setUtrTouched] = useState(shared.playerUtr != null);

  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);

  const lastVerified = useMemo(() => {
    if (!utrEntries || utrEntries.length === 0) return null;
    return [...utrEntries].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
    )[0];
  }, [utrEntries]);

  // Same prefill rule as the Legacy calculator this replaces: once the
  // session is known, an untouched field shows the player's real current
  // UTR; a manual edit (or a shared link's snapshot) always wins.
  const effectiveUtr =
    utrTouched || !hydrated || !isAuthed || player.currentUTR <= 0
      ? utr
      : utr || player.currentUTR.toFixed(1);
  const playerUtr = Number(effectiveUtr) || 8;

  const nudgeUtr = (delta: number) => {
    const next = Math.min(UTR_MAX, Math.max(UTR_MIN, Math.round((playerUtr + delta) * 10) / 10));
    setUtrTouched(true);
    setUtr(next.toFixed(1));
  };

  const travelHours = travelHoursForPill(travel);
  const entryCostNum = entryCost !== "" ? Number(entryCost) : null;
  const travelCostNum = travelCost !== "" ? Number(travelCost) : null;
  const tournamentName = name.trim() || "This tournament";

  const result = useMemo(
    () =>
      evaluateTournamentFit({
        name: tournamentName,
        level,
        playerUtr,
        goalUtr: null,
        drawUtr: null,
        travelHours,
        distanceMiles: null,
        entryCost: entryCostNum != null && Number.isFinite(entryCostNum) && entryCostNum >= 0 ? entryCostNum : null,
        travelCost: travelCostNum != null && Number.isFinite(travelCostNum) && travelCostNum >= 0 ? travelCostNum : null,
      }),
    [tournamentName, level, playerUtr, travelHours, entryCostNum, travelCostNum]
  );

  const meta = VERDICT_META[result.verdict];
  const blurb = result.reasons[0]?.text ?? "";

  const handleShare = async () => {
    const params = encodeTournamentFitShareParams({
      name,
      level,
      playerUtr: utrTouched ? playerUtr : null,
      travel,
      entryCost: entryCostNum,
      travelCost: travelCostNum,
    });
    const url = `${window.location.origin}/tournament-fit?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ message: "Link copied — paste it anywhere to share this exact check.", variant: "success" });
    } catch {
      setToast({ message: "Couldn't copy the link. Copy it from your browser's address bar instead.", variant: "error" });
    }
  };

  const handleAddClick = () => {
    if (!isAuthed) {
      setToast({ message: "Sign in to add this tournament to your events.", variant: "error" });
      return;
    }
    setAddOpen(true);
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-sm font-semibold text-grass hover:underline">
        <ArrowLeft className="h-4 w-4" />
        Events
      </Link>

      <h1 className="mt-3 font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink sm:text-[38px]">
        Is this tournament worth it?
      </h1>
      <p className="mt-2.5 max-w-2xl text-stone">
        Your rating moves most when you beat players at or just above your level. Seeded
        checks the field, the cost per match and the travel.
      </p>

      <div className="mt-7 grid gap-5 lg:grid-cols-[440px_1fr] lg:items-start">
        {/* ------------------------------------------------------- inputs */}
        <div className="rounded-xl border border-line bg-card p-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Tournament name</span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="USTA L4 Bethesda Spring Open"
            />
          </label>

          <div className="mt-5">
            <span className="mb-2 block text-sm font-semibold text-ink">Level</span>
            <div className="grid grid-cols-4 gap-1.5 min-[480px]:grid-cols-8">
              {LEVELS.map((l) => {
                const active = level === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLevel(l.value)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-10 rounded-lg border px-1 font-sans text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-accent",
                      active
                        ? "border-ink bg-ink text-cream"
                        : "border-line bg-card text-ink hover:bg-subtle-hover"
                    )}
                  >
                    {l.value === "utr" ? "UTR" : l.value}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-stone">
              {level === "utr" ? (
                "No typical field for UTR events — strength comes entirely from the draw."
              ) : (
                <>
                  Typical field for this level:{" "}
                  <span className="font-mono font-semibold text-ink">avg {typicalFieldUtr(level).toFixed(1)}</span>{" "}
                  (estimate · enter the real draw for a better answer)
                </>
              )}
            </p>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-sm font-semibold text-ink">Your UTR</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => nudgeUtr(-0.1)}
                aria-label="Decrease UTR"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-ink hover:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-accent"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[64px] text-center font-mono text-3xl font-semibold tabular-nums text-ink">
                {playerUtr.toFixed(1)}
              </span>
              <button
                type="button"
                onClick={() => nudgeUtr(0.1)}
                aria-label="Increase UTR"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-ink hover:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-accent"
              >
                <Plus className="h-4 w-4" />
              </button>
              {!utrTouched && hydrated && isAuthed && player.currentUTR > 0 && (
                <span className="text-[13px] leading-snug text-stone">
                  From your profile
                  {lastVerified ? ` · verified ${shortDate(new Date(lastVerified.recordedAt))}` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-sm font-semibold text-ink">Travel</span>
            <div className="grid grid-cols-3 gap-1.5">
              {TRAVEL_PILLS.map((p) => {
                const active = travel === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setTravel(p.value)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-11 rounded-lg border px-2 font-sans text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-accent",
                      active
                        ? "border-ink bg-ink text-cream"
                        : "border-line bg-card text-ink hover:bg-subtle-hover"
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Entry fee</span>
              <div className="flex items-center gap-1.5">
                <span className="text-base text-stone">$</span>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={entryCost}
                  onChange={(e) => setEntryCost(e.target.value)}
                  placeholder="70"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Travel cost</span>
              <div className="flex items-center gap-1.5">
                <span className="text-base text-stone">$</span>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={travelCost}
                  onChange={(e) => setTravelCost(e.target.value)}
                  placeholder="110"
                />
              </div>
            </label>
          </div>
        </div>

        {/* ------------------------------------------------- live verdict */}
        <div className="min-w-0 lg:sticky lg:top-8">
          <div className="rounded-xl border border-line bg-card p-6">
            <div className={cn("rounded-lg border p-5", meta.card)}>
              <span className={cn("text-xs font-bold uppercase tracking-[0.1em]", meta.eyebrow)}>
                Verdict
              </span>
              <h2 className="mt-1.5 font-seeded text-[32px] font-bold leading-[1.05] tracking-tight">
                {meta.headline}
              </h2>
              {blurb && <p className="mt-2 text-[15px] leading-relaxed">{blurb}</p>}
            </div>

            <div className="mt-5 space-y-4">
              <Meter
                label="Competition"
                value={`${result.competitionScore}/100`}
                pct={result.competitionScore}
              />
              <Meter
                label="Cost per match"
                value={`$${Math.round(result.costPerMatch)} / match`}
                pct={result.costScore}
              />
              <Meter label="Travel" value={`${result.travelScore}/100`} pct={result.travelScore} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <SeededButton onClick={handleAddClick}>Add to my events</SeededButton>
              <SeededButton variant="secondary" onClick={handleShare}>
                Share with my coach
              </SeededButton>
            </div>

            <p className="mt-5 border-t border-line pt-4 text-[13px] leading-relaxed text-stone">
              Directional guidance, not a guarantee. Field strength changes year to year.
            </p>
          </div>
        </div>
      </div>

      <AddToEventsDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        base={{
          name: tournamentName,
          level,
          travelHours,
          entryCost: entryCostNum,
          travelCost: travelCostNum,
        }}
        onSaved={() => {
          setAddOpen(false);
          setToast({ message: "Added to your events.", variant: "success" });
        }}
        onError={(message) => setToast({ message, variant: "error" })}
      />

      <Toast
        open={toast != null}
        onDismiss={() => setToast(null)}
        variant={toast?.variant}
      >
        {toast?.message ?? ""}
      </Toast>
    </div>
  );
}

function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="font-mono tabular-nums text-ink">{value}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-line">
        <div className="h-full rounded-pill bg-grass-300" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

// There's no event-date/city/state input anywhere in the mockup's
// calculator — but lib/supabase/tournaments.ts's saveTournamentEntry
// genuinely requires all three (validateTournamentEntryInput rejects a save
// without them). Rather than fabricate placeholder values for fields this
// screen never collected, "Add to my events" opens this small real drawer
// (the same Drawer component /events' own "Add session"/"Log result"
// actions already use) to collect exactly the 3 missing required fields,
// then calls the real save with everything the calculator already computed.
function AddToEventsDrawer({
  open,
  onClose,
  base,
  onSaved,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  base: {
    name: string;
    level: FitLevel;
    travelHours: number | null;
    entryCost: number | null;
    travelCost: number | null;
  };
  onSaved: (entry: TournamentEntry) => void;
  onError: (message: string) => void;
}) {
  const [eventDate, setEventDate] = useState(() => localDateKey());
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const submit = async () => {
    setFormError("");
    if (!city.trim()) return setFormError("City is required.");
    if (!state.trim()) return setFormError("State is required.");
    if (!eventDate || Number.isNaN(Date.parse(eventDate))) {
      return setFormError("Enter a valid tournament date.");
    }
    setSaving(true);
    try {
      const saved = await saveTournamentEntry({
        ...base,
        eventDate,
        city,
        state,
        distanceMiles: null,
        drawUtr: null,
        goalUtr: null,
      });
      if (!saved) {
        onError("Sign in to add this tournament to your events.");
        return;
      }
      onSaved(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save this tournament.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} eyebrow="Add to my events" title={base.name}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Tournament date</span>
          <input
            className={inputClass}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">City</span>
            <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bethesda" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">State</span>
            <input className={inputClass} value={state} onChange={(e) => setState(e.target.value)} placeholder="MD" />
          </label>
        </div>
        {formError && (
          <p className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">{formError}</p>
        )}
        <SeededButton className="w-full" onClick={submit} loading={saving}>
          Save to my events
        </SeededButton>
      </div>
    </Drawer>
  );
}
