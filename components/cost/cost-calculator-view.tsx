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
import {
  calculateCost,
  loadCostCalculations,
  saveCostCalculation,
  type CostCalculation,
  type CostInputs,
} from "@/lib/db/family";
import { usePlayer } from "@/lib/context/player-context";
import { useDesign } from "@/lib/context/design-context";
import { formatDate, getCurrentGrade } from "@/lib/time";
import { cn } from "@/lib/utils";

/** `embedded`: rendered inside another page (the family budget) that owns
 *  the page's one <h1> — the calculator's title drops to an <h3>. */
export function CostCalculatorView({ schools, embedded = false }: { schools: SchoolLite[]; embedded?: boolean }) {
  return (
    <AuthGate>
      <CostCalculatorInner schools={schools} embedded={embedded} />
    </AuthGate>
  );
}

function CostCalculatorInner({ schools, embedded }: { schools: SchoolLite[]; embedded: boolean }) {
  const Heading = embedded ? "h3" : "h1";
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  const { player } = usePlayer();
  const { data: saved = [], mutate: mutateSaved } = useSWR<CostCalculation[]>(
    "cost-calculations",
    () => loadCostCalculations()
  );
  const [status, setStatus] = useState("");
  // Every cost input starts EMPTY. They used to start at a $115 lesson
  // rate, $1,200 of equipment and $550 a tournament — Seeded's guesses —
  // and the page's headline total was computed from them before the family
  // had typed anything. A total made of our numbers is not their cost.
  // Years remaining and tournaments per year come from the player's own
  // profile (class year, tournament goal) when those exist.
  const [inputs, setInputs] = useState<CostInputs>({
    yearsRemaining: Math.max(1, 12 - getCurrentGrade(player.graduationYear) + 1),
    tournamentsPerYear: player.tournamentsGoal || 0,
    coachingHoursPerWeek: 0,
    lessonRate: 0,
    equipmentBudgetPerYear: 0,
    travelCostPerTournament: 0,
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
          <span className={cn("eyebrow", isSeeded ? "font-seeded uppercase tracking-[0.2em] text-grass" : "text-gold")}>Cost calculator</span>
          <Heading className={cn("mt-3", embedded ? "text-2xl" : "text-4xl sm:text-5xl", isSeeded ? "font-seeded font-semibold tracking-tight text-ink" : "display-serif text-ink")}>
            See the real cost of the pursuit.
          </Heading>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Add up what training, tournaments, travel and equipment will cost your family, from your own numbers.
          </p>
        </div>
        <Badge
          size="md"
          variant={isSeeded ? undefined : "leaf"}
          style={isSeeded ? { background: "var(--s-accent-gradient)", color: "white" } : undefined}
        >
          <DollarSign className="h-4 w-4" />
          {results.total > 0 ? Math.round(results.total).toLocaleString() : "Enter your costs"}
        </Badge>
      </Reveal>

      <div className="mt-7 grid gap-5 lg:grid-cols-[390px_1fr]">
        <Reveal index={1}>
        <Card className={cn("p-6", isSeeded && "seeded-glass border-0 shadow-seeded-1")}>
          <h2 className={cn("font-medium text-ink", isSeeded && "font-seeded")}>Inputs</h2>
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
          <Card className={cn("p-6", isSeeded && "seeded-glass border-0 shadow-seeded-1")}>
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-grass" aria-hidden />
              <h2 className={cn("font-medium text-ink", isSeeded && "font-seeded")}>Scholarships and cost of attendance</h2>
            </div>
            {/* This card used to print "Rough scholarship value" and "Net"
                under real school names, from one generic number per
                division. Seeded holds no cost or aid data for any program. */}
            <p className="mt-4 text-sm text-stone">
              Not available yet. Seeded holds no cost-of-attendance or athletic-aid figures for any
              program, so it does not estimate them. Each school&rsquo;s financial aid office has the
              real numbers.
            </p>
          </Card>
          </Reveal>
          <Reveal index={4}>
          <Card className={cn("p-6", isSeeded && "seeded-glass border-0 shadow-seeded-1")}>
            <h2 className={cn("font-medium text-ink", isSeeded && "font-seeded")}>Saved projections</h2>
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
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  return (
    <Card interactive className={cn("h-full p-5", isSeeded && "seeded-glass border-0 shadow-seeded-1")}>
      <p className="text-xs text-stone-light">{label}</p>
      <p className={cn("mt-2 text-2xl text-ink", isSeeded ? "font-mono" : "font-light")}>
        ${Math.round(value).toLocaleString()}
      </p>
    </Card>
  );
}
