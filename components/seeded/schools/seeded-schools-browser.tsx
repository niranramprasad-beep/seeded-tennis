"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react";
import type { Division, Gender, School } from "@/lib/types";
import { combinedScore } from "@/lib/data";
import { Slider } from "@/components/ui/slider";
import { GenderToggle } from "@/components/shared/gender-toggle";
import { SchoolBadge } from "@/components/shared/school-badge";
import { Reveal } from "@/components/shared/reveal";
import { TiltCard } from "@/components/seeded/shared/tilt-card";
import {
  COLUMNS,
  RANK_MAX,
  Stat,
  mobileValue,
  type SortKey,
} from "@/components/schools/schools-browser";
import { cn } from "@/lib/utils";

const selectClass =
  "h-11 w-full rounded-xl border border-[rgb(var(--c-line))] bg-card px-3.5 font-seeded text-sm text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30";

interface Props {
  gender: Gender;
  setGender: (g: Gender) => void;
  query: string;
  setQuery: (v: string) => void;
  conference: string;
  setConference: (v: string) => void;
  stateFilter: string;
  setStateFilter: (v: string) => void;
  division: "all" | Division;
  setDivision: (v: "all" | Division) => void;
  maxMinUTR: number;
  setMaxMinUTR: (v: number) => void;
  maxRank: number;
  setMaxRank: (v: number) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  filtersActive: boolean;
  ranked: School[];
  conferences: string[];
  states: string[];
  divisions: Division[];
  reset: () => void;
}

// Same filter/sort/ranking state as Legacy (components/schools/schools-
// browser.tsx) — this component owns none of it, just renders it. The
// data-dense sortable table stays a table (restructuring it into a card
// wall would lose the at-a-glance column comparison), but each row gets a
// real 3D cursor-tilt (TiltCard) instead of a flat hover state, which is
// the brief's "cards lift and glow on hover" applied to this page's actual
// UI pattern rather than a literal card grid.
export function SeededSchoolsBrowser({
  gender,
  setGender,
  query,
  setQuery,
  conference,
  setConference,
  stateFilter,
  setStateFilter,
  division,
  setDivision,
  maxMinUTR,
  setMaxMinUTR,
  maxRank,
  setMaxRank,
  sort,
  setSort,
  filtersActive,
  ranked,
  conferences,
  states,
  divisions,
  reset,
}: Props) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <GenderToggle value={gender} onChange={setGender} />
        <span className="hidden font-seeded text-sm text-stone sm:inline">
          Ranking {gender === "men" ? "men's" : "women's"} programs
        </span>
      </div>

      <Reveal>
        <div className="seeded-glass rounded-[24px] p-5 shadow-seeded-1">
          <div className="mb-4 flex items-center gap-2 font-seeded text-sm font-medium text-ink">
            <SlidersHorizontal className="h-4 w-4 text-grass" />
            Filter programs
            {filtersActive && (
              <button
                onClick={reset}
                className="ml-auto flex items-center gap-1 text-xs font-normal text-stone transition-colors hover:text-ink"
              >
                <X className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-xs text-stone-light">Search</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-light" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by school name"
                  className="h-11 w-full rounded-xl border border-[rgb(var(--c-line))] bg-card pl-10 pr-3 font-seeded text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-stone-light">Conference</label>
              <select value={conference} onChange={(e) => setConference(e.target.value)} className={selectClass}>
                <option value="all">All conferences</option>
                {conferences.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-stone-light">Location</label>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className={selectClass}>
                <option value="all">All states</option>
                {states.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-stone-light">Division</label>
              <select value={division} onChange={(e) => setDivision(e.target.value as "all" | Division)} className={selectClass}>
                <option value="all">All divisions</option>
                {divisions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 flex items-center justify-between text-xs text-stone-light">
                <span>Min UTR ≤</span>
                <span className="font-mono font-medium text-grass">
                  {maxMinUTR >= 16.5 ? "Any" : maxMinUTR.toFixed(1)}
                </span>
              </label>
              <Slider value={maxMinUTR} min={1} max={16.5} step={0.5} onChange={setMaxMinUTR} aria-label="Max minimum UTR" />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-2 flex items-center justify-between text-xs text-stone-light">
                <span>Academic ranking</span>
                <span className="font-mono font-medium text-grass">
                  {maxRank >= RANK_MAX ? "Any" : `Top ${maxRank}`}
                </span>
              </label>
              <Slider value={maxRank} min={10} max={RANK_MAX} step={5} onChange={setMaxRank} aria-label="Max US News ranking" />
            </div>
          </div>
        </div>
      </Reveal>

      <div className="mt-6 flex items-center justify-between">
        <p className="font-seeded text-sm text-stone">
          <span className="font-medium text-ink">{ranked.length}</span>{" "}
          {ranked.length === 1 ? "program" : "programs"} ranked by{" "}
          <span className="font-medium text-grass">
            {COLUMNS.find((c) => c.key === sort)?.label ?? "conference"}
          </span>
        </p>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 rounded-xl border border-[rgb(var(--c-line))] bg-card px-3 font-seeded text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30 lg:hidden"
        >
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
          <option value="conf">Conference</option>
        </select>
      </div>

      <div className="mt-3 hidden grid-cols-[44px_1fr_repeat(4,92px)_24px] items-center gap-2 px-4 lg:grid">
        <span className="font-seeded text-xs font-medium uppercase tracking-wide text-stone-light">#</span>
        <button
          onClick={() => setSort("conf")}
          className={cn(
            "flex items-center gap-1 text-left font-seeded text-xs font-medium uppercase tracking-wide transition-colors",
            sort === "conf" ? "text-grass" : "text-stone-light hover:text-ink"
          )}
        >
          Program
          {sort === "conf" && <ChevronUp className="h-3 w-3 rotate-180" />}
        </button>
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            onClick={() => setSort(c.key)}
            title={c.hint}
            className={cn(
              "flex items-center justify-end gap-1 text-right font-seeded text-xs font-medium uppercase tracking-wide transition-colors",
              sort === c.key ? "text-grass" : "text-stone-light hover:text-ink"
            )}
          >
            {c.label}
            {sort === c.key && <ChevronUp className="h-3 w-3 rotate-180" />}
          </button>
        ))}
        <span />
      </div>

      <motion.div layout className="mt-2 flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {ranked.map((s, i) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
            >
              <TiltCard strength={4}>
                <Link href={`/schools/${s.slug}`}>
                  <div className="seeded-glass grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-[18px] p-3.5 shadow-seeded-1 transition-shadow hover:shadow-seeded-2 lg:grid-cols-[44px_1fr_repeat(4,92px)_24px]">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-semibold",
                        i < 3 ? "text-white" : "text-grass"
                      )}
                      style={i < 3 ? { background: "var(--s-accent-gradient)" } : { background: "rgb(var(--c-primary) / 0.1)" }}
                    >
                      {i + 1}
                    </span>

                    <div className="flex min-w-0 items-center gap-3">
                      <SchoolBadge school={s} size={40} />
                      <div className="min-w-0">
                        <p className="truncate font-seeded text-sm font-medium text-ink">{s.shortName}</p>
                        <p className="truncate text-xs text-stone-light">
                          {s.conference} · {s.division} · {s.city}, {s.state}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 lg:hidden">
                      <span className="text-right">
                        <span className="block font-mono text-sm font-medium text-grass">
                          {mobileValue(s, sort)}
                        </span>
                        <span className="block text-xs text-stone-light">
                          {COLUMNS.find((c) => c.key === sort)?.label ?? "Conf."}
                        </span>
                      </span>
                    </div>

                    <Stat active={sort === "combined"}>{combinedScore(s)}</Stat>
                    <Stat active={sort === "utr"}>{s.avgRosterUTR.toFixed(1)}</Stat>
                    <Stat active={sort === "min"}>{s.minCompetitiveUTR.toFixed(1)}</Stat>
                    <Stat active={sort === "rank"}>#{s.usNewsRanking}</Stat>
                    <ArrowUpRight className="hidden h-4 w-4 text-stone-light lg:block" />
                  </div>
                </Link>
              </TiltCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {ranked.length === 0 && (
        <div className="mt-12 flex flex-col items-center text-center">
          <p className="font-seeded text-lg font-medium text-ink">No programs match</p>
          <p className="mt-1 text-sm text-stone">Try widening your filters.</p>
          <button
            onClick={reset}
            className="mt-4 rounded-pill border border-[rgb(var(--c-line))] px-4 py-2 font-seeded text-sm font-medium text-ink"
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
