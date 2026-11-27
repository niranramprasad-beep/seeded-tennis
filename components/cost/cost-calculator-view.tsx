"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Calculator, DollarSign, Save } from "lucide-react";
import type { SchoolLite } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/seeded/ui/pill";
import { Reveal } from "@/components/shared/reveal";
import {
  calculateCost,
  loadCostCalculations,
  saveCostCalculation,
  type CostCalculation,
  type CostInputs,
} from "@/lib/db/family";
import { clampCostInput } from "@/lib/budget-limits";
import { usePlayer } from "@/lib/context/player-context";
import { formatDate, getCurrentGrade } from "@/lib/time";
import { cn } from "@/lib/utils";

/** `embedded`: rendered inside another page (the family budget) that owns
 *  the page's one <h1> — the calculator's title drops to an <h3>. */
/** `playerGraduationYear`: the player's real class year, when the page
 *  knows it (the family budget passes the family player's). Omitted, it is
 *  the signed-in user's own — only if they ARE the player; a parent's own
 *  profile row holds no class year of theirs worth projecting from. */
export function CostCalculatorView({
  schools,
  embedded = false,
  playerGraduationYear,
}: {
  schools: SchoolLite[];
  embedded?: boolean;
  playerGraduationYear?: number | null;
}) {
  return (
    <AuthGate>
      <CostCalculatorInner schools={schools} embedded={embedded} playerGraduationYear={playerGraduationYear} />
    </AuthGate>
  );
}

/** Years of junior tennis left, counting this school year, from a REAL class
 *  year — or 0 (an empty input) without one. */
function yearsRemainingFor(graduationYear: number | null, now: Date = new Date()): number {
  if (graduationYear == null) return 0;
  return Math.max(1, 12 - getCurrentGrade(graduationYear, now) + 1);
}

function CostCalculatorInner({
  schools,
  embedded,
  playerGraduationYear,
}: {
  schools: SchoolLite[];
  embedded: boolean;
  playerGraduationYear?: number | null;
}) {
  const Heading = embedded ? "h3" : "h1";
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
  // Years remaining comes from the PLAYER's real class year when there is
  // one. Tournaments per year starts empty: it used to start at the
  // profile's tournaments_goal, which was a hardcoded 12 for every account
  // (049), and "planned this season" is not a per-year count anyway.
  const graduationYear =
    playerGraduationYear !== undefined ? playerGraduationYear : player.role === "player" ? player.graduationYear : null;
  const [inputs, setInputs] = useState<CostInputs>({
    yearsRemaining: clampCostInput("yearsRemaining", yearsRemainingFor(graduationYear)),
    tournamentsPerYear: 0,
    coachingHoursPerWeek: 0,
    lessonRate: 0,
    equipmentBudgetPerYear: 0,
    travelCostPerTournament: 0,
  });

  const results = useMemo(() => calculateCost(inputs), [inputs]);
  // None of these quantities (years, tournaments, rates, budgets) can be
  // negative — clamp here rather than let a stray "-" produce a negative
  // multiplier that would flip costs negative downstream. Nor can they be
  // past what a person means (lib/budget-limits.ts COST_INPUT_LIMITS): nine
  // digits in each field made totals that ran off the page (BUG-007). The
  // field shows the number it was held to, as it does for a negative.
  const updateNumber = (key: keyof CostInputs, value: string) =>
    setInputs((prev) => ({ ...prev, [key]: clampCostInput(key, Number(value) || 0) }));

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
          <span className={cn("eyebrow", "font-seeded uppercase tracking-[0.2em] text-grass")}>Cost calculator</span>
          <Heading className={cn("mt-3", embedded ? "text-2xl" : "text-4xl sm:text-5xl", "font-seeded font-semibold tracking-tight text-ink")}>
            See the real cost of the pursuit.
          </Heading>
          <p className="mt-2 max-w-2xl text-sm text-stone">
            Add up what training, tournaments, travel and equipment will cost your family, from your own numbers.
          </p>
        </div>
        {results.total > 0 ? (
          <Pill tone="green" icon={<DollarSign className="h-3.5 w-3.5" aria-hidden />} className="w-fit max-w-full whitespace-normal font-mono tabular-nums [overflow-wrap:anywhere]">
            {Math.round(results.total).toLocaleString()}
          </Pill>
        ) : (
          <Pill tone="neutral" icon={<DollarSign className="h-3.5 w-3.5" aria-hidden />} className="w-fit">
            Enter your costs
          </Pill>
        )}
      </Reveal>

      <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-[390px_minmax(0,1fr)]">
        <Reveal index={1}>
        <Card className="p-6">
          <h2 className={cn("font-medium text-ink", "font-seeded")}>Inputs</h2>
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
              <Calculator className="h-5 w-5 text-grass" aria-hidden />
              <h2 className={cn("font-medium text-ink", "font-seeded")}>Scholarships and cost of attendance</h2>
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
          <Card className="p-6">
            <h2 className={cn("font-medium text-ink", "font-seeded")}>Saved projections</h2>
            <div className="mt-4 space-y-2">
              {saved.slice(0, 4).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-xl bg-cream px-4 py-3 text-sm">
                  <span className="text-stone">{formatDate(row.createdAt)}</span>
                  <span className="min-w-0 text-right font-medium text-ink [overflow-wrap:anywhere]">{money(row.results.total)}</span>
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
  // 0 shows as an EMPTY field ("Not set"), not a "0" that reads like a
  // number the family entered.
  const [text, setText] = useState(value === 0 ? "" : String(value));

  // No dependency array on purpose: this must re-check on every render, not
  // just when `value` changes from its PREVIOUS value. Typing two different
  // invalid values in a row that both clamp to the same number (e.g. "-1"
  // then "-3", both clamped to 0) would otherwise never re-sync — `value`
  // itself never changes (stays 0 → 0), so a dependency-gated effect would
  // silently skip the resync and leave the invalid text on screen. The
  // guard inside (only setState when the two actually disagree) is what
  // keeps this from looping forever, not a dependency array.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs every render on purpose (see above); the inner guard stops the loop
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
        placeholder="Not set"
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
    // A stat tile, not a link: no hover lift (lib/clickable-affordance.test.ts).
    <Card className="h-full p-5">
      <p className="text-xs text-stone-light">{label}</p>
      <p className={cn("mt-2 min-w-0 text-2xl text-ink [overflow-wrap:anywhere]", "font-mono")}>
        ${Math.round(value).toLocaleString()}
      </p>
    </Card>
  );
}
