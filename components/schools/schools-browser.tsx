"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react";
import type { Division, School } from "@/lib/types";
import { useGender } from "@/lib/context/gender-context";
import { combinedScore } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { GenderToggle } from "@/components/shared/gender-toggle";
import { SchoolBadge } from "@/components/shared/school-badge";
import { cn } from "@/lib/utils";

interface Props {
  schools: School[];
  conferences: string[];
  states: string[];
  divisions: Division[];
}

type SortKey = "combined" | "utr" | "min" | "rank" | "conf";

const RANK_MAX = 150;

const selectClass =
  "h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-3.5 text-sm text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30";

const COLUMNS: { key: SortKey; label: string; hint: string }[] = [
  { key: "combined", label: "Seeded score", hint: "Academics + tennis blend" },
  { key: "utr", label: "Avg UTR", hint: "Average roster UTR" },
  { key: "min", label: "Min UTR", hint: "Minimum competitive UTR" },
  { key: "rank", label: "US News", hint: "Academic ranking" },
];

export function SchoolsBrowser({ schools, conferences, states, divisions }: Props) {
  const { gender, setGender } = useGender();
  const [query, setQuery] = useState("");
  const [conference, setConference] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [division, setDivision] = useState<"all" | Division>("all");
  const [maxMinUTR, setMaxMinUTR] = useState(16.5);
  const [maxRank, setMaxRank] = useState(RANK_MAX);
  const [sort, setSort] = useState<SortKey>("combined");

  const filtersActive =
    query !== "" ||
    conference !== "all" ||
    stateFilter !== "all" ||
    division !== "all" ||
    maxMinUTR < 16.5 ||
    maxRank < RANK_MAX;

  const ranked = useMemo(() => {
    const filtered = schools.filter((s) => {
      if (s.gender !== gender) return false;
      if (division !== "all" && s.division !== division) return false;
      if (query && !s.name.toLowerCase().includes(query.toLowerCase()))
        return false;
      if (conference !== "all" && s.conference !== conference) return false;
      if (stateFilter !== "all" && s.state !== stateFilter) return false;
      if (s.minCompetitiveUTR > maxMinUTR) return false;
      if (s.usNewsRanking > maxRank) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      switch (sort) {
        case "utr":
          return b.avgRosterUTR - a.avgRosterUTR;
        case "min":
          return b.minCompetitiveUTR - a.minCompetitiveUTR;
        case "rank":
          return a.usNewsRanking - b.usNewsRanking;
        case "conf":
          return (
            a.conference.localeCompare(b.conference) ||
            b.avgRosterUTR - a.avgRosterUTR
          );
        default:
          return combinedScore(b) - combinedScore(a);
      }
    });
  }, [schools, gender, division, query, conference, stateFilter, maxMinUTR, maxRank, sort]);

  const reset = () => {
    setQuery("");
    setConference("all");
    setStateFilter("all");
    setDivision("all");
    setMaxMinUTR(16.5);
    setMaxRank(RANK_MAX);
  };

  return (
    <div>
      {/* gender toggle */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <GenderToggle value={gender} onChange={setGender} />
        <span className="hidden text-sm text-stone sm:inline">
          Ranking {gender === "men" ? "men's" : "women's"} programs
        </span>
      </div>

      {/* filters */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
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
                className="h-11 w-full rounded-xl border-[0.5px] border-line bg-card pl-10 pr-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
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
              <span className="font-medium text-grass">{maxMinUTR >= 16.5 ? "Any" : maxMinUTR.toFixed(1)}</span>
            </label>
            <Slider value={maxMinUTR} min={1} max={16.5} step={0.5} onChange={setMaxMinUTR} aria-label="Max minimum UTR" />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 flex items-center justify-between text-xs text-stone-light">
              <span>Academic ranking</span>
              <span className="font-medium text-grass">{maxRank >= RANK_MAX ? "Any" : `Top ${maxRank}`}</span>
            </label>
            <Slider value={maxRank} min={10} max={RANK_MAX} step={5} onChange={setMaxRank} aria-label="Max US News ranking" />
          </div>
        </div>
      </Card>

      {/* leaderboard header */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-stone">
          <span className="font-medium text-ink">{ranked.length}</span>{" "}
          {ranked.length === 1 ? "program" : "programs"} ranked by{" "}
          <span className="font-medium text-grass">
            {COLUMNS.find((c) => c.key === sort)?.label ?? "conference"}
          </span>
        </p>
        {/* mobile sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 rounded-xl border-[0.5px] border-line bg-card px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30 lg:hidden"
        >
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
          <option value="conf">Conference</option>
        </select>
      </div>

      {/* desktop column headers (sortable) */}
      <div className="mt-3 hidden grid-cols-[44px_1fr_repeat(4,92px)_24px] items-center gap-2 px-4 lg:grid">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-light">#</span>
        <button
          onClick={() => setSort("conf")}
          className={cn(
            "flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wide transition-colors",
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
              "flex items-center justify-end gap-1 text-right text-xs font-medium uppercase tracking-wide transition-colors",
              sort === c.key ? "text-grass" : "text-stone-light hover:text-ink"
            )}
          >
            {c.label}
            {sort === c.key && <ChevronUp className="h-3 w-3 rotate-180" />}
          </button>
        ))}
        <span />
      </div>

      {/* rows */}
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
              <Link href={`/schools/${s.slug}`}>
                <Card
                  interactive
                  className="grid grid-cols-[36px_1fr_auto] items-center gap-3 p-3.5 lg:grid-cols-[44px_1fr_repeat(4,92px)_24px]"
                >
                  {/* rank */}
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                      i === 0
                        ? "bg-grass text-cream"
                        : i < 3
                          ? "bg-leaf-accent/50 text-grass-900"
                          : "bg-grass-50 text-grass"
                    )}
                  >
                    {i + 1}
                  </span>

                  {/* program */}
                  <div className="flex min-w-0 items-center gap-3">
                    <SchoolBadge school={s} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {s.shortName}
                      </p>
                      <p className="truncate text-xs text-stone-light">
                        {s.conference} · {s.division} · {s.city}, {s.state}
                      </p>
                    </div>
                  </div>

                  {/* mobile compact stat */}
                  <div className="flex items-center gap-2 lg:hidden">
                    <span className="text-right">
                      <span className="block text-sm font-medium text-grass">
                        {mobileValue(s, sort)}
                      </span>
                      <span className="block text-[10px] text-stone-light">
                        {COLUMNS.find((c) => c.key === sort)?.label ?? "Conf."}
                      </span>
                    </span>
                  </div>

                  {/* desktop columns */}
                  <Stat active={sort === "combined"}>{combinedScore(s)}</Stat>
                  <Stat active={sort === "utr"}>{s.avgRosterUTR.toFixed(1)}</Stat>
                  <Stat active={sort === "min"}>{s.minCompetitiveUTR.toFixed(1)}</Stat>
                  <Stat active={sort === "rank"}>#{s.usNewsRanking}</Stat>
                  <ArrowUpRight className="hidden h-4 w-4 text-stone-light lg:block" />
                </Card>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {ranked.length === 0 && (
        <div className="mt-12 flex flex-col items-center text-center">
          <p className="text-lg font-medium text-ink">No programs match</p>
          <p className="mt-1 text-sm text-stone">Try widening your filters.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
            Reset filters
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({
  children,
  active,
}: {
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "hidden text-right text-sm tabular-nums lg:block",
        active ? "font-semibold text-grass" : "text-stone"
      )}
    >
      {children}
    </span>
  );
}

function mobileValue(s: School, sort: SortKey): string {
  switch (sort) {
    case "utr":
      return s.avgRosterUTR.toFixed(1);
    case "min":
      return s.minCompetitiveUTR.toFixed(1);
    case "rank":
      return `#${s.usNewsRanking}`;
    case "conf":
      return s.conference;
    default:
      return String(combinedScore(s));
  }
}
