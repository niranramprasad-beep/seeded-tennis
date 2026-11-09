"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Division, Gender, School } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { classifySchoolFit, countSchoolFits, schoolUtrRange, utrToPct } from "@/lib/school-fit";
import { regionForState, ALL_REGIONS, type SchoolRegion } from "@/lib/school-regions";
import { academicTier, ACADEMIC_TIER_LABEL, type AcademicTier } from "@/lib/school-academics";
import { GenderToggle } from "@/components/shared/gender-toggle";
import { FitBadge, type FitBand } from "@/components/seeded/ui/fit-badge";
import { DataChip } from "@/components/seeded/ui/data-chip";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 w-full rounded-lg border border-[#D6D3C8] bg-card px-3 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30";

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
}

// Pixel-exact to Schools.dc.html. Owns no base filter/sort state (that's
// still the parent SchoolsBrowser's, shared with Legacy) — only the
// Seeded-exclusive additions: region, the fit-band chip row, and compare
// selection, none of which Legacy has any use for.
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
}: Props) {
  const { player, updatePlayer } = usePlayer();
  const [region, setRegion] = useState<"all" | SchoolRegion>("all");
  const [chip, setChip] = useState<ChipFilter>("all");
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const academicValue: "all" | AcademicTier =
    maxRank <= 25 ? "top25" : maxRank <= 50 ? "top50" : maxRank <= 100 ? "top100" : "all";

  const counts = useMemo(() => countSchoolFits(player.currentUTR, ranked), [player.currentUTR, ranked]);
  const savedSlugs = useMemo(() => new Set(player.targetSchoolSlugs), [player.targetSchoolSlugs]);

  const visible = useMemo(() => {
    return ranked.filter((s) => {
      if (region !== "all" && regionForState(s.state) !== region) return false;
      if (chip === "saved") return savedSlugs.has(s.slug);
      else if (chip !== "all" && classifySchoolFit(player.currentUTR, s) !== chip) return false;
      return true;
    });
  }, [ranked, region, chip, player.currentUTR, savedSlugs]);

  const toggleCompare = (slug: string) => {
    setCompareSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 3 ? prev : [...prev, slug]
    );
  };

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
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="School, city or conference"
              className="h-11 w-full rounded-lg border border-[#D6D3C8] bg-card pl-10 pr-3 text-[15px] text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
            />
          </div>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
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
        <ChipButton active={chip === "saved"} onClick={() => setChip("saved")} variant="plain">
          Saved {savedSlugs.size}
        </ChipButton>
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
            <div className="grid grid-cols-[28px_minmax(0,2.2fr)_100px_minmax(0,2fr)_80px_90px_110px] items-center gap-3.5 border-b border-line px-[18px] py-3 text-xs font-semibold uppercase tracking-wide text-stone">
              <span aria-hidden />
              <span>Program</span>
              <span>Your fit</span>
              <span>You vs team UTR</span>
              <span>Openings</span>
              <span>Acad.</span>
              <span>Data</span>
            </div>
            {visible.map((s) => {
              const fit = classifySchoolFit(player.currentUTR, s);
              const range = schoolUtrRange(s);
              return (
                <div
                  key={s.id}
                  className="grid grid-cols-[28px_minmax(0,2.2fr)_100px_minmax(0,2fr)_80px_90px_110px] items-center gap-3.5 border-b border-[#EFEDE6] px-[18px] py-3.5 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    aria-label={`Compare ${s.shortName}`}
                    checked={compareSlugs.includes(s.slug)}
                    onChange={() => toggleCompare(s.slug)}
                    disabled={!compareSlugs.includes(s.slug) && compareSlugs.length >= 3}
                  />
                  <Link href={`/schools/${s.slug}`} className="min-w-0 text-ink">
                    <p className="truncate text-[15px] font-semibold">{s.shortName}</p>
                    <p className="truncate text-xs text-stone-light">
                      {s.conference} · {s.division} · {s.state}
                    </p>
                  </Link>
                  <FitBadge band={fit} />
                  <RangeBar
                    rangeStartPct={utrToPct(range.min)}
                    rangeEndPct={utrToPct(range.max)}
                    medianPct={utrToPct(s.avgRosterUTR)}
                    youPct={utrToPct(player.currentUTR)}
                    caption={`You ${player.currentUTR.toFixed(1)} · ${range.min.toFixed(1)}–${range.max.toFixed(1)}`}
                  />
                  <DataChip status="missing">Not tracked</DataChip>
                  <DataChip status="updated">{ACADEMIC_TIER_LABEL[academicTier(s.usNewsRanking)]}</DataChip>
                  <DataChip status="missing">Not tracked</DataChip>
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
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#D6D3C8] bg-card px-4 text-sm font-semibold text-ink"
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
            const fit = classifySchoolFit(player.currentUTR, s);
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
    </div>
  );
}

const CHIP_VARIANT: Record<string, { on: string; off: string }> = {
  dark: { on: "bg-ink text-white border-ink", off: "bg-card text-stone border-line" },
  reach: { on: "bg-[#FBEDE6] text-[#9C4824] border-[#F0CDBC]", off: "bg-card text-stone border-line" },
  target: { on: "bg-grass-50 text-grass border-grass-100", off: "bg-card text-stone border-line" },
  likely: { on: "bg-[#EEF3D6] text-[#4A5A10] border-[#D8E3A8]", off: "bg-card text-stone border-line" },
  plain: { on: "bg-ink text-white border-ink", off: "bg-card text-stone border-line" },
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
