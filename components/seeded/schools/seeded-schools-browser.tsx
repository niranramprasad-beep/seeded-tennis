"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronDown, Search } from "lucide-react";
import type { Division, Gender, School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import {
  classifySchoolFit,
  countSchoolFits,
  explainSchoolFit,
  schoolUtrRange,
  summerBeforeSeniorYear,
  utrToPct,
} from "@/lib/school-fit";
import { loadUtrEntries } from "@/lib/supabase/utr";
import { regionForState, ALL_REGIONS, type SchoolRegion } from "@/lib/school-regions";
import { academicTier, ACADEMIC_TIER_LABEL, type AcademicTier } from "@/lib/school-academics";
import { sortSchoolsForSeeded, SEEDED_SORT_LABEL, type SeededSchoolSort } from "@/lib/school-sort";
import { isEditableTarget } from "@/lib/keyboard-shortcuts";
import { useWhatIfUtr } from "@/lib/hooks/use-what-if-utr";
import { useStarSchools, STAR_TOAST_DURATION_MS } from "@/lib/hooks/use-star-schools";
import { GenderToggle } from "@/components/shared/gender-toggle";
import { FitBadge, type FitBand } from "@/components/seeded/ui/fit-badge";
import { DataChip } from "@/components/seeded/ui/data-chip";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { StarButton } from "@/components/seeded/ui/star-button";
import { Toast } from "@/components/seeded/ui/toast";
import { WhatIfPanel } from "@/components/seeded/ui/what-if-panel";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-card px-3 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30";

type ChipFilter = "all" | FitBand | "saved";

interface Props {
  gender: Gender;
  setGender: (g: Gender) => void;
  query: string;
  setQuery: (v: string) => void;
  division: "all" | Division;
  setDivision: (v: "all" | Division) => void;
  maxRank: number;
  setMaxRank: (v: number) => void;
  ranked: School[];
  divisions: Division[];
  reset: () => void;
  /** Full, unfiltered catalog (both genders) — used only as the real
   * candidate pool for "Why this band"'s alternative-school suggestion
   * (lib/school-fit.ts's explainSchoolFit), so a narrowed `ranked` list
   * (division/search/rank filters applied) never limits which real schools
   * can be suggested as realistic alternatives. */
  allSchools: School[];
}

// Pixel-exact to Schools.dc.html. Owns no base filter/sort state (that's
// still the parent SchoolsBrowser's, shared with Legacy) — only the
// Seeded-exclusive additions: region, the fit-band chip row, the what-if
// slider/sort (lib/school-sort.ts — new Seeded-only sort modes that need
// the real fit-band math Legacy has no use for), compare selection, star-
// to-target, and the `/`/`j`/`k`/`s` keyboard shortcuts, none of which
// Legacy has any use for.
export function SeededSchoolsBrowser({
  gender,
  setGender,
  query,
  setQuery,
  division,
  setDivision,
  maxRank,
  setMaxRank,
  ranked,
  divisions,
  reset,
  allSchools,
}: Props) {
  const { player, updatePlayer } = usePlayer();
  const [region, setRegion] = useState<"all" | SchoolRegion>("all");
  const [chip, setChip] = useState<ChipFilter>("all");
  const [sort, setSort] = useState<SeededSchoolSort>("default");
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { isStarred, toggleStar, toast, dismissToast } = useStarSchools();

  // Same "utr-entries" SWR key /today and /plan already fetch under — a
  // real cache hit here, not a second network round-trip, whenever one of
  // those has already loaded this session.
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const realUtrHistory = useMemo(
    () => (utrEntries ?? []).map((e) => ({ date: new Date(e.recordedAt), utr: e.utr })),
    [utrEntries]
  );

  // The "what if my UTR is ___ by June {year}?" slider — defaults to the
  // player's real current UTR (identical to today's page until actually
  // touched), and from then on drives every band/count/dot below in place
  // of the real currentUTR. See lib/what-if-utr.ts for why only "My pace"
  // mode re-passes real history into the 4-band classifier.
  const whatIf = useWhatIfUtr({
    currentUTR: player.currentUTR,
    graduationYear: player.graduationYear,
    gender: player.gender,
    utrHistory: realUtrHistory,
  });
  const effectiveUtr = whatIf.hypotheticalUTR;

  // Same real grad-year context as the what-if hook, plus the full catalog
  // — explainSchoolFit only needs the catalog for its point-7 alternative-
  // school suggestion. Uses the SAME history choice as the what-if pass
  // (real history only for "My pace"), so the expanded row's "why this
  // band" never disagrees with the band chip right above it.
  const explanationInput = useMemo(
    () => ({
      utrHistory: whatIf.whatIfProjection?.utrHistory ?? [],
      graduationYear: player.graduationYear,
      gender: player.gender,
      catalog: allSchools,
    }),
    [whatIf.whatIfProjection, player.graduationYear, player.gender, allSchools]
  );

  // A school's profile page links here with ?compare={slug}&gender={gender}
  // to pre-select it (same plain window.location.search read
  // coaches-view.tsx already uses for its own ?school= deep link — no
  // useSearchParams()/Suspense needed). `ranked` is already gender-filtered
  // by the parent, so a cross-gender deep link (e.g. from a women's program
  // page while this defaults to men's) would silently fail a `ranked`
  // membership check — the slug's own data-file suffix convention isn't
  // reliable enough to infer gender from (schools.ts has no suffix for
  // men, schools-extra.ts uses "-m"), so the profile page passes the
  // school's real `gender` explicitly and this switches the toggle to
  // match before trusting the slug.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("compare");
    const g = params.get("gender");
    if (!slug) return;
    if ((g === "men" || g === "women") && g !== gender) setGender(g);
    setCompareSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const academicValue: "all" | AcademicTier =
    maxRank <= 25 ? "top25" : maxRank <= 50 ? "top50" : maxRank <= 100 ? "top100" : "all";

  const counts = useMemo(
    () => countSchoolFits(effectiveUtr, ranked, whatIf.whatIfProjection),
    [effectiveUtr, ranked, whatIf.whatIfProjection]
  );
  const savedSlugs = useMemo(() => new Set(player.targetSchoolSlugs), [player.targetSchoolSlugs]);

  const visible = useMemo(() => {
    const filtered = ranked.filter((s) => {
      if (region !== "all" && regionForState(s.state) !== region) return false;
      if (chip === "saved") return savedSlugs.has(s.slug);
      else if (chip !== "all" && classifySchoolFit(effectiveUtr, s, whatIf.whatIfProjection) !== chip)
        return false;
      return true;
    });
    return sortSchoolsForSeeded(filtered, sort, effectiveUtr, whatIf.whatIfProjection);
  }, [ranked, region, chip, sort, effectiveUtr, whatIf.whatIfProjection, savedSlugs]);

  // A materially different list (a filter/sort change) invalidates
  // whatever row the keyboard highlight was pointing at.
  useEffect(() => {
    setHighlightedIndex(null);
  }, [region, chip, sort, query, division, maxRank, gender]);

  // `/` focuses search, `j`/`k` move the highlighted row, `s` stars/
  // unstars it — all guarded so typing in the search box (or any other
  // text input) never triggers them. See lib/keyboard-shortcuts.ts.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "j" || e.key === "k") {
        if (visible.length === 0) return;
        e.preventDefault();
        setHighlightedIndex((prev) => {
          const base = prev == null ? -1 : prev;
          const next = e.key === "j" ? base + 1 : base - 1;
          return Math.min(Math.max(next, 0), visible.length - 1);
        });
      } else if (e.key === "s") {
        if (highlightedIndex == null) return;
        const s = visible[highlightedIndex];
        if (!s) return;
        e.preventDefault();
        toggleStar(s.slug, s.shortName);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, highlightedIndex, toggleStar]);

  const safeHighlightIndex =
    highlightedIndex != null && highlightedIndex < visible.length ? highlightedIndex : null;

  const toggleCompare = (slug: string) => {
    setCompareSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 3 ? prev : [...prev, slug]
    );
  };

  // Bulk action from the compare tray (an earlier phase) — kept as its own
  // single merge+write rather than N individual toggleStar() calls, which
  // would race against each other (each one's closure reads the same
  // pre-loop membership snapshot). Still the exact same real
  // targetSchoolSlugs/updatePlayer() mechanism; a bulk add reasonably gets
  // one bulk write, not N stacked per-item undo toasts.
  const saveSelectedToTargets = () => {
    const merged = Array.from(new Set([...player.targetSchoolSlugs, ...compareSlugs]));
    updatePlayer({ targetSchoolSlugs: merged });
  };

  const compareSchools = ranked.filter((s) => compareSlugs.includes(s.slug));

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <GenderToggle value={gender} onChange={setGender} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-seeded text-[30px] font-semibold tracking-tight text-ink">Schools</h1>
          <p className="mt-1.5 text-stone">
            Sorted by fit for you. {ranked.length} {gender === "men" ? "men's" : "women's"} programs.
          </p>
        </div>
        <label className="flex w-full max-w-[360px] flex-col gap-1.5 text-xs font-medium text-stone">
          Search
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-light" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="School, city or conference"
              className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
            />
          </div>
        </label>
      </div>

      <div className="mt-5">
        <WhatIfPanel {...whatIf} seniorSummerYear={summerBeforeSeniorYear(player.graduationYear).getFullYear()} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ChipButton active={chip === "all"} onClick={() => setChip("all")} variant="dark">
            All {ranked.length}
          </ChipButton>
          <ChipButton active={chip === "reach"} onClick={() => setChip("reach")} variant="reach">
            Reach {counts.reach}
          </ChipButton>
          <ChipButton active={chip === "target"} onClick={() => setChip("target")} variant="target">
            Target {counts.target}
          </ChipButton>
          <ChipButton active={chip === "likely"} onClick={() => setChip("likely")} variant="likely">
            Likely {counts.likely}
          </ChipButton>
          <ChipButton
            active={chip === "out-of-range"}
            onClick={() => setChip("out-of-range")}
            variant="outOfRange"
          >
            Out of range {counts.outOfRange}
          </ChipButton>
          <ChipButton active={chip === "saved"} onClick={() => setChip("saved")} variant="plain">
            Saved {savedSlugs.size}
          </ChipButton>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-stone">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SeededSchoolSort)}
            className="h-8 rounded-lg border border-input bg-card px-2 font-sans text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
          >
            {Object.entries(SEEDED_SORT_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-start gap-6">
        <aside className="w-full max-w-[260px] flex-1 rounded-xl border border-line bg-card p-[18px]" aria-label="Filters">
          <strong className="text-[15px] font-semibold text-ink">Filters</strong>
          <div className="mt-3.5 flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-stone">
              Division
              <select value={division} onChange={(e) => setDivision(e.target.value as "all" | Division)} className={selectClass}>
                <option value="all">All divisions</option>
                {divisions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-stone">
              Region
              <select value={region} onChange={(e) => setRegion(e.target.value as "all" | SchoolRegion)} className={selectClass}>
                <option value="all">All regions</option>
                {ALL_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-stone">
              Academics
              <select
                value={academicValue}
                onChange={(e) => {
                  const v = e.target.value as "all" | AcademicTier;
                  setMaxRank(v === "all" ? 150 : v === "top25" ? 25 : v === "top50" ? 50 : 100);
                }}
                className={selectClass}
              >
                <option value="all">Any ranking</option>
                <option value="top25">{ACADEMIC_TIER_LABEL.top25} national</option>
                <option value="top50">{ACADEMIC_TIER_LABEL.top50} national</option>
                <option value="top100">{ACADEMIC_TIER_LABEL.top100} national</option>
              </select>
            </label>
            <p className="text-xs text-stone-light">
              Openings and cost after aid aren&apos;t tracked yet — real per-school data when we have it.
            </p>
            {(region !== "all" || division !== "all" || maxRank < 150 || query) && (
              <button onClick={() => { reset(); setRegion("all"); }} className="self-start text-xs font-semibold text-grass">
                Reset filters
              </button>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-[999_1_560px] overflow-x-auto rounded-xl border border-line bg-card">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[28px_28px_minmax(0,2.2fr)_100px_minmax(0,2fr)_80px_90px_110px] items-center gap-3.5 border-b border-line px-[18px] py-3 text-xs font-semibold uppercase tracking-wide text-stone">
              <span aria-hidden />
              <span aria-hidden />
              <span>Program</span>
              <span>Your fit</span>
              <span>You vs team UTR</span>
              <span>Openings</span>
              <span>Acad.</span>
              <span>Data</span>
            </div>
            {visible.map((s, index) => {
              const fit = classifySchoolFit(effectiveUtr, s, whatIf.whatIfProjection);
              const range = schoolUtrRange(s);
              const expanded = expandedSlug === s.slug;
              // Only the currently-expanded row actually builds the full
              // explanation (real regression + alternatives lookup) — no
              // reason to pay that cost for every row in the list.
              const explanation = expanded
                ? explainSchoolFit(effectiveUtr, s, explanationInput)
                : null;
              return (
                <div key={s.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    data-keyboard-highlighted={safeHighlightIndex === index || undefined}
                    onClick={() => setExpandedSlug(expanded ? null : s.slug)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedSlug(expanded ? null : s.slug);
                      }
                    }}
                    className={cn(
                      "grid cursor-pointer grid-cols-[28px_28px_minmax(0,2.2fr)_100px_minmax(0,2fr)_80px_90px_110px] items-center gap-3.5 border-b border-line px-[18px] py-3.5 last:border-b-0 hover:bg-cream/40",
                      safeHighlightIndex === index && "bg-cream/70 ring-2 ring-inset ring-grass/40"
                    )}
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-stone-light transition-transform", expanded && "rotate-180")}
                      aria-hidden
                    />
                    <input
                      type="checkbox"
                      aria-label={`Compare ${s.shortName}`}
                      checked={compareSlugs.includes(s.slug)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleCompare(s.slug)}
                      disabled={!compareSlugs.includes(s.slug) && compareSlugs.length >= 3}
                    />
                    <div className="flex min-w-0 items-center gap-1">
                      <StarButton
                        starred={isStarred(s.slug)}
                        onToggle={() => toggleStar(s.slug, s.shortName)}
                        label={s.shortName}
                        className="h-7 w-7"
                      />
                      <Link
                        href={`/schools/${s.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 text-ink"
                      >
                        <p className="truncate text-[15px] font-semibold">{s.shortName}</p>
                        <p className="truncate text-xs text-stone-light">
                          {s.conference} · {s.division} · {s.state}
                        </p>
                      </Link>
                    </div>
                    <FitBadge band={fit} />
                    <RangeBar
                      rangeStartPct={utrToPct(range.min)}
                      rangeEndPct={utrToPct(range.max)}
                      medianPct={utrToPct(s.avgRosterUTR)}
                      youPct={utrToPct(effectiveUtr)}
                      caption={`You ${effectiveUtr.toFixed(1)} · ${range.min.toFixed(1)}–${range.max.toFixed(1)}`}
                      low={range.min}
                      median={s.avgRosterUTR}
                      high={range.max}
                      you={effectiveUtr}
                    />
                    <DataChip status="missing">Not tracked</DataChip>
                    <DataChip status="updated">{ACADEMIC_TIER_LABEL[academicTier(s.usNewsRanking)]}</DataChip>
                    <DataChip status="missing">Not tracked</DataChip>
                  </div>
                  {expanded && explanation && (
                    <div className="border-b border-line bg-cream/40 px-[18px] py-4 text-sm text-ink last:border-b-0">
                      <p>{explanation.summary}</p>
                      {explanation.gapToFloor != null && explanation.gapToMedian != null && (
                        <p className="mt-1.5 text-stone">
                          Gap to team floor: {explanation.gapToFloor > 0 ? "+" : ""}
                          {explanation.gapToFloor.toFixed(1)} · Gap to team median:{" "}
                          {explanation.gapToMedian > 0 ? "+" : ""}
                          {explanation.gapToMedian.toFixed(1)}
                        </p>
                      )}
                      {explanation.nextBand && (
                        <p className="mt-1.5">
                          <strong>What would move it: </strong>
                          {explanation.nextBand.message}
                        </p>
                      )}
                      {explanation.unreachable && explanation.alternatives.length > 0 && (
                        <p className="mt-1.5 text-stone">
                          <strong className="text-ink">Consider instead: </strong>
                          {explanation.alternatives.map((a) => a.shortName).join(", ")} — similar academics or
                          region, and realistically in reach today.
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-stone-light">
                        {explanation.playersLeaving} {explanation.academics}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <p className="text-[15px] font-medium text-ink">No programs match</p>
                <button onClick={() => { reset(); setRegion("all"); setChip("all"); }} className="text-sm font-semibold text-grass">
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {compareSlugs.length > 0 && (
        <div className="sticky bottom-4 mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-[18px] py-3 shadow-card">
          <span className="text-sm text-ink">
            <strong>{compareSlugs.length} selected</strong> · {compareSchools.map((s) => s.shortName).join(", ")}
          </span>
          <span className="flex-1" />
          <button
            onClick={saveSelectedToTargets}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-semibold text-ink"
          >
            Save to targets
          </button>
          <button
            onClick={() => setCompareOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-grass px-4 text-sm font-semibold text-on-primary hover:bg-grass-600"
          >
            Compare side by side
          </button>
        </div>
      )}

      <Drawer open={compareOpen} onClose={() => setCompareOpen(false)} title="Compare schools" widthClass="max-w-xl">
        <div className="flex flex-col gap-4">
          {compareSchools.map((s) => {
            const fit = classifySchoolFit(effectiveUtr, s, whatIf.whatIfProjection);
            return (
              <div key={s.id} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{s.shortName}</p>
                  <FitBadge band={fit} />
                </div>
                <p className="mt-1 text-xs text-stone-light">
                  {s.conference} · {s.division} · {s.city}, {s.state}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-stone-light">Avg roster UTR</dt>
                  <dd className="text-right font-mono tabular-nums text-ink">{s.avgRosterUTR.toFixed(1)}</dd>
                  <dt className="text-stone-light">Min competitive UTR</dt>
                  <dd className="text-right font-mono tabular-nums text-ink">{s.minCompetitiveUTR.toFixed(1)}</dd>
                  <dt className="text-stone-light">US News ranking</dt>
                  <dd className="text-right font-mono tabular-nums text-ink">#{s.usNewsRanking}</dd>
                </dl>
              </div>
            );
          })}
          {compareSchools.length === 0 && <p className="text-sm text-stone">Select up to 3 schools to compare.</p>}
        </div>
      </Drawer>

      <Toast open={!!toast} onDismiss={dismissToast} action={toast?.action} duration={STAR_TOAST_DURATION_MS}>
        {toast?.message ?? " "}
      </Toast>
    </div>
  );
}

const CHIP_VARIANT: Record<string, { on: string; off: string }> = {
  dark: { on: "bg-ink text-cream border-ink", off: "bg-card text-stone border-line" },
  reach: { on: "bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text))] border-[rgb(var(--c-clay-tint-border))]", off: "bg-card text-stone border-line" },
  target: { on: "bg-grass-50 text-grass border-grass-100", off: "bg-card text-stone border-line" },
  likely: { on: "bg-[rgb(var(--c-sage-tint-bg))] text-[rgb(var(--c-sage-tint-text))] border-[rgb(var(--c-sage-tint-border))]", off: "bg-card text-stone border-line" },
  outOfRange: { on: "bg-ink text-cream border-ink", off: "bg-card text-stone border-line" },
  plain: { on: "bg-ink text-cream border-ink", off: "bg-card text-stone border-line" },
};

function ChipButton({
  active,
  onClick,
  variant,
  children,
}: {
  active: boolean;
  onClick: () => void;
  variant: keyof typeof CHIP_VARIANT;
  children: React.ReactNode;
}) {
  const v = CHIP_VARIANT[variant];
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 py-1.5 text-[13px] font-semibold transition-colors",
        active ? v.on : v.off
      )}
    >
      {children}
    </button>
  );
}
