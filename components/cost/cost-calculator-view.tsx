"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Calculator, DollarSign, Save } from "lucide-react";
import type { SchoolLite } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/shared/reveal";
import { CountUpOnView } from "@/components/shared/count-up-on-view";
import {
  calculateCost,
  loadCostCalculations,
  saveCostCalculation,
  type CostCalculation,
  type CostInputs,
} from "@/lib/supabase/features";
import { usePlayer } from "@/lib/context/player-context";
import { formatDate, getCurrentGrade } from "@/lib/time";

export function CostCalculatorView({ schools }: { schools: SchoolLite[] }) {
  return (
    <AuthGate>
      <CostCalculatorInner schools={schools} />
    </AuthGate>
  );
}

function CostCalculatorInner({ schools }: { schools: SchoolLite[] }) {
  const { player } = usePlayer();
  const { data: saved = [], mutate: mutateSaved } = useSWR<CostCalculation[]>(
    "cost-calculations",
    () => loadCostCalculations()
  );
  const [status, setStatus] = useState("");
  const targetSchools = schools.filter((s) => player.targetSchoolSlugs.includes(s.slug)).slice(0, 5);
  const [inputs, setInputs] = useState<CostInputs>({
    yearsRemaining: Math.max(1, 12 - getCurrentGrade(player.graduationYear) + 1),
    tournamentsPerYear: player.tournamentsGoal || 12,
    coachingHoursPerWeek: 3,
    lessonRate: 115,
    equipmentBudgetPerYear: 1200,
    travelCostPerTournament: 550,
    targetSchools: targetSchools.length
      ? targetSchools.map(toScholarshipSchool)
      : schools.slice(0, 3).map(toScholarshipSchool),
  });

  const results = useMemo(() => calculateCost(inputs), [inputs]);
  // None of these quantities (years, tournaments, rates, budgets) can be
  // negative — clamp here rather than let a stray "-" produce a negative
  // multiplier that would flip costs negative downstream.
  const updateNumber = (key: keyof CostInputs, value: string) =>
    setInputs((prev) => ({ ...prev, [key]: Math.max(0, Number(value) || 0) }));

  const save = async () => {
    try {
      const row = await saveCostCalculation(inputs, "Seeded cost projection");
      if (row) {
        mutateSaved([row, ...saved], { revalidate: false });
        setStatus("Projection saved to your account.");
      } else {
        setStatus("Sign in with Supabase configured to save projections.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? `Could not save: ${err.message}` : "Could not save the projection.");
    }
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Reveal className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="eyebrow text-gold">Cost calculator</span>
          <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
            See the real cost of the pursuit.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Estimate training, tournaments, travel, equipment, and compare against realistic scholarship ranges.
          </p>
        </div>
        <Badge variant="leaf" size="md">
          <DollarSign className="h-4 w-4" />
          <CountUpOnView value={Math.round(results.total)} prefix="$" />
        </Badge>
      </Reveal>

      <div className="mt-7 grid gap-5 lg:grid-cols-[390px_1fr]">
        <Reveal index={1}>
        <Card className="p-6">
          <h2 className="font-medium text-ink">Inputs</h2>
          <div className="mt-4 space-y-3">
            <NumberInput label="Years remaining" value={inputs.yearsRemaining} onChange={(v) => updateNumber("yearsRemaining", v)} />
            <NumberInput label="Tournaments per year" value={inputs.tournamentsPerYear} onChange={(v) => updateNumber("tournamentsPerYear", v)} />
            <NumberInput label="Coaching hours per week" value={inputs.coachingHoursPerWeek} onChange={(v) => updateNumber("coachingHoursPerWeek", v)} />
            <NumberInput label="Average lesson rate" value={inputs.lessonRate} onChange={(v) => updateNumber("lessonRate", v)} />
            <NumberInput label="Equipment per year" value={inputs.equipmentBudgetPerYear} onChange={(v) => updateNumber("equipmentBudgetPerYear", v)} />
            <NumberInput label="Travel/tournament cost" value={inputs.travelCostPerTournament} onChange={(v) => updateNumber("travelCostPerTournament", v)} />
            <Button className="w-full" onClick={save}>
              <Save className="h-4 w-4" />
              Save projection
            </Button>
            <p className="text-xs text-stone-light">{status}</p>
          </div>
        </Card>
        </Reveal>

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Coaching", results.coaching],
              ["Tournaments + travel", results.tournaments],
              ["Equipment", results.equipment],
            ].map(([label, value], i) => (
              <Reveal key={label as string} index={i} step={0.06}>
                <CostCard label={label as string} value={value as number} />
              </Reveal>
            ))}
          </div>
          <Reveal index={3}>
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-grass" />
              <h2 className="font-medium text-ink">Scholarship comparison</h2>
            </div>
            <div className="mt-5 space-y-3">
              {results.scholarships.map((school) => (
                <div key={school.name} className="rounded-[18px] border-[0.5px] border-line bg-card p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-ink">{school.name}</p>
                      <p className="text-xs text-stone">Estimated scholarship value: {money(school.scholarshipValue)}</p>
                    </div>
                    <Badge variant="outline">Net: {money(school.netCost)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          </Reveal>
          <Reveal index={4}>
          <Card className="p-6">
            <h2 className="font-medium text-ink">Saved projections</h2>
            <div className="mt-4 space-y-2">
              {saved.slice(0, 4).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-xl bg-cream px-4 py-3 text-sm">
                  <span className="text-stone">{formatDate(row.createdAt)}</span>
                  <span className="font-medium text-ink">{money(row.results.total)}</span>
                </div>
              ))}
              {!saved.length && <p className="text-sm text-stone">No saved projections yet.</p>}
            </div>
          </Card>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function toScholarshipSchool(s: SchoolLite) {
  // Tennis is an "equivalency" sport — a roster splits a handful of
  // scholarships across ~9-10 players, so no individual recruit gets
  // anywhere near "35% of cost of attendance." Using the team-wide max as
  // one player's personal award (the old numbers) made the assumed
  // scholarship bigger than most families' actual training spend for
  // EVERY school, so "Net" always clamped to $0 regardless of inputs.
  // These are realistic individual-recruit averages instead.
  // The Ivy League gives no athletic scholarships at all (NCAA rule) —
  // any non-zero number here was simply wrong for a school like Cornell.
  const scholarshipPercent =
    s.conference === "Ivy League"
      ? 0
      : s.division === "D1"
        ? 18
        : s.division === "D2"
          ? 12
          : 0;
  const annualCost = s.usNewsRanking <= 30 ? 86000 : s.division === "D3" ? 79000 : 62000;
  return { name: s.name, division: s.division, annualCost, scholarshipPercent };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  // A plain controlled `type="number"` re-renders on every keystroke with
  // Number(text) — typing just "-" parses to NaN, falls back to 0, and
  // snaps the field to "0" before a minus sign can ever be followed by a
  // digit (so "-5" became "05"). Keeping the raw text locally lets an
  // in-progress value like "-" or "12." sit as typed; it only commits
  // upward once it's actually a complete, valid number.
  const [text, setText] = useState(String(value));

  // No dependency array on purpose: this must re-check on every render, not
  // just when `value` changes from its PREVIOUS value. Typing two different
  // invalid values in a row that both clamp to the same number (e.g. "-1"
  // then "-3", both clamped to 0) would otherwise never re-sync — `value`
  // itself never changes (stays 0 → 0), so a dependency-gated effect would
  // silently skip the resync and leave the invalid text on screen. The
  // guard inside (only setState when the two actually disagree) is what
  // keeps this from looping forever, not a dependency array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  });

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-stone-light">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^-?\d*\.?\d*$/.test(next)) return;
          setText(next);
          if (next !== "" && next !== "-" && !Number.isNaN(Number(next))) {
            onChange(next);
          }
        }}
        className="h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
      />
    </label>
  );
}

function CostCard({ label, value }: { label: string; value: number }) {
  return (
    <Card interactive className="h-full p-5">
      <p className="text-xs text-stone-light">{label}</p>
      <p className="mt-2 text-2xl font-light text-ink">
        <CountUpOnView value={Math.round(value)} prefix="$" />
      </p>
    </Card>
  );
}
