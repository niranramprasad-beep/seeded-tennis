"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, DollarSign, Save } from "lucide-react";
import type { School } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  calculateCost,
  loadCostCalculations,
  saveCostCalculation,
  type CostCalculation,
  type CostInputs,
} from "@/lib/supabase/features";
import { usePlayer } from "@/lib/context/player-context";

export function CostCalculatorView({ schools }: { schools: School[] }) {
  return (
    <AuthGate>
      <CostCalculatorInner schools={schools} />
    </AuthGate>
  );
}

function CostCalculatorInner({ schools }: { schools: School[] }) {
  const { player } = usePlayer();
  const [saved, setSaved] = useState<CostCalculation[]>([]);
  const [status, setStatus] = useState("");
  const targetSchools = schools.filter((s) => player.targetSchoolSlugs.includes(s.slug)).slice(0, 5);
  const [inputs, setInputs] = useState<CostInputs>({
    yearsRemaining: Math.max(1, 12 - player.grade + 1),
    tournamentsPerYear: player.tournamentsGoal || 12,
    coachingHoursPerWeek: 3,
    lessonRate: 115,
    equipmentBudgetPerYear: 1200,
    travelCostPerTournament: 550,
    targetSchools: targetSchools.length
      ? targetSchools.map(toScholarshipSchool)
      : schools.slice(0, 3).map(toScholarshipSchool),
  });

  useEffect(() => {
    loadCostCalculations().then(setSaved);
  }, []);

  const results = useMemo(() => calculateCost(inputs), [inputs]);
  const updateNumber = (key: keyof CostInputs, value: string) =>
    setInputs((prev) => ({ ...prev, [key]: Number(value) || 0 }));

  const save = async () => {
    const row = await saveCostCalculation(inputs, "Seeded cost projection");
    if (row) setSaved((prev) => [row, ...prev]);
    setStatus("Projection saved to Supabase.");
  };

  return (
    <main className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="font-serif text-lg italic text-leaf-accent">Cost calculator</p>
          <h1 className="mt-1 text-3xl font-light tracking-tight text-ink">
            See the real cost of the pursuit.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Estimate training, tournaments, travel, equipment, and compare against realistic scholarship ranges.
          </p>
        </div>
        <Badge variant="leaf" size="md">
          <DollarSign className="h-4 w-4" />
          {money(results.total)}
        </Badge>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[390px_1fr]">
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

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <CostCard label="Coaching" value={results.coaching} />
            <CostCard label="Tournaments + travel" value={results.tournaments} />
            <CostCard label="Equipment" value={results.equipment} />
          </div>
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
          <Card className="p-6">
            <h2 className="font-medium text-ink">Saved projections</h2>
            <div className="mt-4 space-y-2">
              {saved.slice(0, 4).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-xl bg-cream px-4 py-3 text-sm">
                  <span className="text-stone">{new Date(row.createdAt).toLocaleDateString()}</span>
                  <span className="font-medium text-ink">{money(row.results.total)}</span>
                </div>
              ))}
              {!saved.length && <p className="text-sm text-stone">No saved projections yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function toScholarshipSchool(s: School) {
  const scholarshipPercent = s.division === "D1" ? 35 : s.division === "D2" ? 25 : 0;
  const annualCost = s.usNewsRanking <= 30 ? 86000 : s.division === "D3" ? 79000 : 62000;
  return { name: s.name, division: s.division, annualCost, scholarshipPercent };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-stone-light">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
      />
    </label>
  );
}

function CostCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-stone-light">{label}</p>
      <p className="mt-2 text-2xl font-light text-ink">{money(value)}</p>
    </Card>
  );
}
