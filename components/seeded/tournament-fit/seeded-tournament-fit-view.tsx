"use client";

import { useId, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { loadUtrEntries, loadUtrEntriesFor } from "@/lib/db/plan";
import { loadFamilyMembers, type FamilyMember } from "@/lib/db/family";
import { pickFamilyPlayer, resolveFamilyPlayerFacts } from "@/lib/family-view";
import {
  isCalendarDateKey,
  saveTournamentEntry,
  TournamentSaveError,
  type TournamentEntry,
} from "@/lib/db/events";
import {
  evaluateTournamentFit,
  LEVELS,
  UTR_MAX,
  UTR_MIN,
  verdictBlockers,
  verdictBlockerSentence,
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
import { formatShortDate, parseLocalDate } from "@/lib/time";
import { toolBackLink } from "@/lib/tool-back-link";
import { cn, formatPlayerUtr } from "@/lib/utils";

const inputClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-focus";

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

// Pixel-exact to "14 Tournament fit finder.png" — a genuinely live
// calculator (no "get the verdict" submit step like the Legacy version
// below): every keystroke/pill click re-runs the real evaluateTournamentFit
// engine via useMemo. MOCKUP DEVIATION (PR D, D5): the mockup's form has no
// draw-strength input, but the verdict now needs the draw's average UTR —
// the level-to-UTR table the mockup's "typical field" note relied on had no
// source and made almost everything "Worth it". So there is one extra field
// under Level; without it the verdict reads "Not enough info". goalUtr is
// still passed as null (no goal input).
// useSearchParams() bails a static page out to client-only rendering, so
// /tournament-fit (in the sitemap) served the nav, the footer and nothing in
// between to a crawler. The URL-reading half sits inside a Suspense boundary
// whose fallback is the same checker with no shared link applied — which the
// server can render. Same pattern as /onboarding.
export function SeededTournamentFitView() {
  return (
    <Suspense fallback={<TournamentFitView searchParams={NO_PARAMS} />}>
      <TournamentFitViewFromUrl />
    </Suspense>
  );
}

const NO_PARAMS = new URLSearchParams();

function TournamentFitViewFromUrl() {
  const searchParams = useSearchParams();
  return <TournamentFitView searchParams={searchParams} />;
}

function TournamentFitView({ searchParams }: { searchParams: URLSearchParams }) {
  const { player, isAuthed, hydrated } = usePlayer();
  // A parent checks a tournament for their PLAYER: the prefilled rating, its
  // label and its date are the child's, never the parent's own (empty) one.
  const isParent = player.role === "parent";
  const { data: familyMembers = [] } = useSWR<FamilyMember[]>(isParent ? "family-members" : null, () =>
    loadFamilyMembers()
  );
  const familyPlayer = isParent ? pickFamilyPlayer(familyMembers) : undefined;
  const subjectFacts = resolveFamilyPlayerFacts(familyPlayer, player);
  const subjectFirst = isParent ? (familyPlayer?.name ?? "").trim().split(/\s+/)[0] || null : null;
  const subjectUtr = isParent ? (subjectFacts.currentUtr ?? 0) : player.currentUTR;
  const whoseUtr = isParent ? `${subjectFirst ?? "Your player"}'s UTR` : "Your UTR";
  const { data: utrEntries } = useSWR(
    isParent ? (familyPlayer?.id ? ["utr-entries", familyPlayer.id] : null) : "utr-entries",
    () => (isParent && familyPlayer?.id ? loadUtrEntriesFor(familyPlayer.id) : loadUtrEntries())
  );

  // A /tournament-fit?... link is the entire "Share with my coach" feature
  // (see lib/tournament-fit-share.ts) — decode it once on mount so opening a
  // shared link reproduces the exact same check the sender ran.
  const [shared] = useState(() => decodeTournamentFitShareParams(searchParams));

  const [name, setName] = useState(shared.name ?? "");
  // No level is pre-selected: a verdict judged against a default "L4" the
  // family never chose read as a real answer (production sweep C15).
  const [level, setLevel] = useState<FitLevel | null>(shared.level ?? null);
  const [travel, setTravel] = useState<TravelPill>(shared.travel ?? "local");
  const [entryCost, setEntryCost] = useState(shared.entryCost != null ? String(shared.entryCost) : "");
  const [travelCost, setTravelCost] = useState(shared.travelCost != null ? String(shared.travelCost) : "");
  // The draw's average UTR. The verdict is judged from it (D5); without it
  // the checker says "Not enough info" rather than guess from the level.
  const [drawUtrText, setDrawUtrText] = useState(shared.drawUtr != null ? formatPlayerUtr(shared.drawUtr) : "");
  const [utr, setUtr] = useState(shared.playerUtr != null ? formatPlayerUtr(shared.playerUtr) : "");
  // A shared link's UTR is a deliberate snapshot — it should win over the
  // opener's own profile, same reasoning as a manual edit.
  const [utrTouched, setUtrTouched] = useState(shared.playerUtr != null);

  const { mutate } = useSWRConfig();
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);

  // The last UTR the player typed in — not a verified rating. See the same
  // rename in seeded-roadmap-layout.tsx (P0-7).
  const lastLoggedUtr = useMemo(() => {
    if (!utrEntries || utrEntries.length === 0) return null;
    return [...utrEntries].sort(
      (a, b) => parseLocalDate(b.recordedAt).getTime() - parseLocalDate(a.recordedAt).getTime()
    )[0];
  }, [utrEntries]);

  // Same prefill rule as the Legacy calculator this replaces: once the
  // session is known, an untouched field shows the player's real current
  // UTR; a manual edit (or a shared link's snapshot) always wins.
  const effectiveUtr =
    utrTouched || !hydrated || !isAuthed || subjectUtr <= 0
      ? utr
      : utr || formatPlayerUtr(subjectUtr);
  // No rating → no verdict. This used to fall back to 8.0 and print "Your
  // UTR 8.0 … you're at 8.0" to anyone without one — a parent included.
  const parsedUtr = Number(effectiveUtr);
  const playerUtr: number | null =
    effectiveUtr !== "" && Number.isFinite(parsedUtr) && parsedUtr >= UTR_MIN && parsedUtr <= UTR_MAX
      ? parsedUtr
      : null;

  const nudgeUtr = (delta: number) => {
    if (playerUtr == null) return;
    const next = Math.min(UTR_MAX, Math.max(UTR_MIN, Math.round((playerUtr + delta) * 100) / 100));
    setUtrTouched(true);
    setUtr(formatPlayerUtr(next));
  };

  const travelHours = travelHoursForPill(travel);
  const entryCostRaw = entryCost !== "" ? Number(entryCost) : null;
  const travelCostRaw = travelCost !== "" ? Number(travelCost) : null;
  const entryCostNum = entryCostRaw != null && Number.isFinite(entryCostRaw) && entryCostRaw >= 0 ? entryCostRaw : null;
  const travelCostNum = travelCostRaw != null && Number.isFinite(travelCostRaw) && travelCostRaw >= 0 ? travelCostRaw : null;
  const drawRaw = drawUtrText.trim() !== "" ? Number(drawUtrText) : null;
  const drawUtrNum = drawRaw != null && Number.isFinite(drawRaw) && drawRaw >= UTR_MIN && drawRaw <= UTR_MAX ? drawRaw : null;
  const tournamentName = name.trim() || "This tournament";

  // No verdict until the level, a rating, the entry fee and the draw's
  // average UTR are all in.
  const blockers = useMemo(
    () => verdictBlockers({ level, playerUtr, entryCost: entryCostNum, drawUtr: drawUtrNum }),
    [level, playerUtr, entryCostNum, drawUtrNum]
  );

  const result = useMemo(
    () =>
      blockers.length > 0 || level == null || playerUtr == null || drawUtrNum == null
        ? null
        : evaluateTournamentFit({
            name: tournamentName,
            level,
            playerUtr,
            goalUtr: null,
            drawUtr: drawUtrNum,
            travelHours,
            distanceMiles: null,
            entryCost: entryCostNum,
            travelCost: travelCostNum,
          }),
    [blockers, tournamentName, level, playerUtr, travelHours, entryCostNum, travelCostNum, drawUtrNum]
  );

  const meta = result ? VERDICT_META[result.verdict] : null;
  const blurb = result?.reasons[0]?.text ?? "";
  const backLink = hydrated ? toolBackLink({ isAuthed, role: player.role }) : null;

  const handleShare = async () => {
    const params = encodeTournamentFitShareParams({
      name,
      level,
      playerUtr: utrTouched ? playerUtr : null,
      travel,
      entryCost: entryCostNum,
      travelCost: travelCostNum,
      drawUtr: drawUtrNum,
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
    // The button is disabled until there is a verdict (D7); this is the
    // belt to that brace.
    if (!result) return;
    setAddOpen(true);
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      {backLink ? (
        <Link
          href={backLink.href}
          className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-grass hover:underline sm:min-h-6"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLink.label}
        </Link>
      ) : !hydrated ? (
        // Before the session check: a browser with a saved session
        // (html[data-session], set by the head script) reserves the back
        // link's row, so the heading doesn't drop 56px when it arrives
        // (CLS 0.074 at 375). Signed-out browsers never show it.
        <span
          aria-hidden
          className="pre-session-only invisible mb-3 min-h-11 items-center gap-1.5 text-sm font-semibold sm:min-h-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Events
        </span>
      ) : null}

      <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink sm:text-[38px]">
        Is this tournament worth it?
      </h1>
      <p className="mt-2.5 max-w-2xl text-stone">
        Your rating moves most when you beat players at or just above your level. Seeded
        checks the field, the cost per match and the travel.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start">
        {/* ------------------------------------------------------- inputs */}
        <div className="rounded-xl border border-line bg-card p-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Tournament name</span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="mt-5" role="group" aria-labelledby="tf-level-label">
            <span id="tf-level-label" className="mb-2 block text-sm font-semibold text-ink">Level</span>
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
                      "min-h-11 rounded-lg border px-1 font-sans text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
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
            {/* No "typical field for this level" range any more: that table
                had no source (D5). The level only sets the matches to
                expect and whether long travel is forgiven. */}
            <p className="mt-2 text-[13px] leading-relaxed text-stone">
              {level == null
                ? "Pick the level printed on the event page."
                : "The level sets how many matches to expect. How strong the field is comes from the draw's average below."}
            </p>
          </div>

          <div className="mt-5">
            <label htmlFor="tf-draw" className="mb-2 block text-sm font-semibold text-ink">
              Draw&apos;s average UTR
            </label>
            <input
              id="tf-draw"
              type="text"
              inputMode="decimal"
              value={drawUtrText}
              onChange={(e) => setDrawUtrText(e.target.value)}
              aria-describedby="tf-draw-hint"
              className={cn(inputClass, "max-w-[160px] font-mono tabular-nums")}
            />
            <p id="tf-draw-hint" className="mt-2 text-[13px] leading-relaxed text-stone">
              Average the UTRs on the entry list, or use last year&apos;s draw. The verdict compares it with{" "}
              {isParent ? `${subjectFirst ?? "your player"}'s` : "your"} UTR.
              {drawUtrText.trim() !== "" && drawUtrNum == null ? ` UTR runs from ${UTR_MIN} to ${UTR_MAX}.` : ""}
            </p>
          </div>

          <div className="mt-5">
            <label htmlFor="tf-utr" className="mb-2 block text-sm font-semibold text-ink">{whoseUtr}</label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => nudgeUtr(-0.1)}
                disabled={playerUtr == null}
                aria-label="Decrease UTR"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-ink hover:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                id="tf-utr"
                type="text"
                inputMode="decimal"
                value={effectiveUtr}
                placeholder="—"
                onChange={(e) => {
                  setUtrTouched(true);
                  setUtr(e.target.value);
                }}
                className="w-[120px] rounded-lg border border-input bg-card py-1 text-center font-mono text-3xl font-semibold tabular-nums text-ink placeholder:text-stone-light"
              />
              <button
                type="button"
                onClick={() => nudgeUtr(0.1)}
                disabled={playerUtr == null}
                aria-label="Increase UTR"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-ink hover:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <Plus className="h-4 w-4" />
              </button>
              {!utrTouched && hydrated && isAuthed && subjectUtr > 0 && (
                <span className="text-[13px] leading-snug text-stone">
                  {isParent ? `From ${subjectFirst ?? "your player"}'s profile` : "From your profile"}
                  {lastLoggedUtr
                    ? ` · self-reported ${formatShortDate(lastLoggedUtr.recordedAt)}`
                    : ""}
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
                      "min-h-11 rounded-lg border px-2 font-sans text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
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
                  placeholder="Optional"
                />
              </div>
            </label>
          </div>
        </div>

        {/* ------------------------------------------------- live verdict */}
        <div className="min-w-0 lg:sticky lg:top-8">
          <div className="rounded-xl border border-line bg-card p-6">
            {result && meta ? (
              <>
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

              </>
            ) : (
              <div className="rounded-lg border border-line bg-cream p-5">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-stone">Verdict</span>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink" aria-live="polite">
                  {verdictBlockerSentence(blockers)}
                  {playerUtr == null && effectiveUtr !== "" ? ` UTR runs from ${UTR_MIN} to ${UTR_MAX}.` : ""}
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2.5">
              {/* A parent has no events of their own: /events is the
                  player's planner and AuthGate keeps parents out of it.
                  "Add to my events" would write a tournament entry under
                  the parent's id that the player never sees.
                  Disabled until there is a verdict (D7): a tournament saved
                  before the check is done had no draw average and no
                  verdict. */}
              {player.role !== "parent" && (
                <SeededButton onClick={handleAddClick} disabled={!result}>Add to my events</SeededButton>
              )}
              <SeededButton variant="secondary" onClick={handleShare}>
                {isParent ? "Copy a link to this check" : "Share with my coach"}
              </SeededButton>
            </div>

            <p className="mt-5 border-t border-line pt-4 text-[13px] leading-relaxed text-stone">
              Directional guidance, not a guarantee. Field strength changes year to year.
            </p>
          </div>
        </div>
      </div>

      {level && (
        <AddToEventsDrawer
          open={addOpen}
          onClose={() => setAddOpen(false)}
          base={{
            name: name.trim(),
            level,
            travelHours,
            entryCost: entryCostNum,
            travelCost: travelCostNum,
            drawUtr: drawUtrNum,
          }}
          onSaved={(entry) => {
            setAddOpen(false);
            // Every screen that lists tournament entries reads them through
            // an SWR key starting "tournament-entries" (/events' Upcoming,
            // the family overview, budget and weekly report). Revalidate all
            // of them, so the new row is there the moment /events opens
            // rather than after the 5s dedupe window.
            void mutate((key) => key === "tournament-entries" || (Array.isArray(key) && key[0] === "tournament-entries"));
            setToast({ message: `Saved. ${entry.name} is in Upcoming on Events.`, variant: "success" });
          }}
        />
      )}

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

type DrawerField = "name" | "date" | "city" | "state";

// The calculator collects no date, so "Add to my events" opens this drawer
// for it (and the optional city and state).
//
// Production sweep C3 ("Save to my events saves nothing, no error"): on
// staging the write itself succeeds for the sweep persona (201, row in
// Upcoming), and staging's API log shows no tournament_entries request from
// anyone else in the 24 hours before — the save never left the browser. The
// drawer is why: City and State showed "Bethesda" / "MD" as placeholders,
// so an empty form looked filled in; Save then stopped on "City is
// required." in one small line under the fields, and the date was
// pre-filled with TODAY, so even a "complete" form saved the wrong day.
// Now: no placeholders that look like data, a blank date, each problem shown
// on its own field (aria-invalid + message) with focus moved to the first,
// and every server failure shown in plain words in the drawer.
function AddToEventsDrawer({
  open,
  onClose,
  base,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  base: {
    name: string;
    level: FitLevel;
    travelHours: number | null;
    entryCost: number | null;
    travelCost: number | null;
    drawUtr: number | null;
  };
  onSaved: (entry: TournamentEntry) => void;
}) {
  const [tName, setTName] = useState(base.name);
  const [eventDate, setEventDate] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DrawerField, string>>>({});
  const [formError, setFormError] = useState("");
  const idBase = useId();
  const refs = {
    name: useRef<HTMLInputElement>(null),
    date: useRef<HTMLInputElement>(null),
    city: useRef<HTMLInputElement>(null),
    state: useRef<HTMLInputElement>(null),
  };

  // The checker's name can change while the drawer is closed; pick it up
  // each time the drawer opens, without clobbering an edit made inside it.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTName(base.name);
      setFieldErrors({});
      setFormError("");
    }
  }

  const submit = async () => {
    setFormError("");
    const errors: Partial<Record<DrawerField, string>> = {};
    if (!tName.trim()) errors.name = "Give the tournament a name.";
    if (!eventDate) errors.date = "Pick the tournament's date.";
    else if (!isCalendarDateKey(eventDate)) errors.date = "That isn't a real date.";
    // City and state are optional (D4): nothing computes from them.
    setFieldErrors(errors);
    const first = (["name", "date", "city", "state"] as DrawerField[]).find((f) => errors[f]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    setSaving(true);
    try {
      const saved = await saveTournamentEntry({
        ...base,
        name: tName,
        eventDate,
        city,
        state,
        distanceMiles: null,
        goalUtr: null,
      });
      onSaved(saved);
    } catch (err) {
      setFormError(
        err instanceof TournamentSaveError || err instanceof Error
          ? err.message
          : "Couldn't save this tournament. Check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: DrawerField,
    label: string,
    input: Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "className">
  ) => {
    const id = `${idBase}-${key}`;
    const err = fieldErrors[key];
    return (
      <label className="block" htmlFor={id}>
        <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
        <input
          ref={refs[key]}
          id={id}
          className={cn(inputClass, err && "border-error")}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-error` : undefined}
          {...input}
        />
        {err && (
          <span id={`${id}-error`} className="mt-1.5 block text-sm text-error">
            {err}
          </span>
        )}
      </label>
    );
  };

  return (
    <Drawer open={open} onClose={onClose} eyebrow="Add to my events" title={tName.trim() || "New tournament"}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {field("name", "Tournament name", { value: tName, onChange: (e) => setTName(e.target.value) })}
        {field("date", "Tournament date", {
          type: "date",
          value: eventDate,
          onChange: (e) => setEventDate(e.target.value),
        })}
        <div className="grid grid-cols-2 gap-3">
          {field("city", "City (optional)", { value: city, onChange: (e) => setCity(e.target.value), autoComplete: "address-level2" })}
          {field("state", "State (optional)", { value: state, onChange: (e) => setState(e.target.value), autoComplete: "address-level1" })}
        </div>
        {formError && (
          <p role="alert" className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
            {formError}
          </p>
        )}
        <SeededButton type="submit" className="w-full" loading={saving}>
          Save to my events
        </SeededButton>
      </form>
    </Drawer>
  );
}
