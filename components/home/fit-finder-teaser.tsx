"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn, formatUTR } from "@/lib/utils";
import {
  evaluateTournamentFit,
  UTR_MAX,
  UTR_MIN,
  type FitLevel,
} from "@/lib/tournament-fit";

// Compact levels for the homepage widget — the full page has all the detail.
const LEVEL_PILLS: { value: FitLevel; label: string }[] = [
  { value: "L1", label: "L1" },
  { value: "L2", label: "L2" },
  { value: "L3", label: "L3" },
  { value: "L4", label: "L4" },
  { value: "L5", label: "L5" },
  { value: "L6", label: "L6" },
  { value: "L7", label: "L7" },
  { value: "utr", label: "UTR" },
];

const VERDICT_STYLE = {
  good: {
    label: "GOOD FIT",
    icon: CheckCircle2,
    wrap: "border-grass/30 bg-grass text-cream",
  },
  decent: {
    label: "DECENT FIT",
    icon: MinusCircle,
    wrap: "border-gold/40 bg-[#8A6D2F] text-cream",
  },
  bad: {
    label: "BAD FIT",
    icon: XCircle,
    wrap: "border-[#9C3B22]/40 bg-[#8F3A24] text-cream",
  },
} as const;

// Live, no-signup preview of the Tournament Fit Finder. Same scoring engine
// as /tournament-fit, reduced to the four inputs that matter most.
export function FitFinderTeaser() {
  const [playerUtr, setPlayerUtr] = useState(8);
  const [drawUtr, setDrawUtr] = useState(8.5);
  const [level, setLevel] = useState<FitLevel>("L4");
  const [travelHours, setTravelHours] = useState(2);
  const [totalCost, setTotalCost] = useState(250);

  const result = useMemo(
    () =>
      evaluateTournamentFit({
        name: "This tournament",
        level,
        playerUtr,
        goalUtr: null,
        drawUtr,
        travelHours,
        distanceMiles: null,
        entryCost: totalCost,
        travelCost: 0,
      }),
    [level, playerUtr, drawUtr, travelHours, totalCost]
  );

  const verdict = VERDICT_STYLE[result.verdict];
  const Icon = verdict.icon;
  const headline = result.reasons[0]?.text ?? "";

  return (
    <div className="overflow-hidden rounded-[28px] border-hairline border-line bg-card shadow-soft">
      <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
        {/* controls */}
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">Try it — no account needed</p>
            <div className="flex flex-wrap gap-1">
              {LEVEL_PILLS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLevel(l.value)}
                  className={cn(
                    "rounded-pill px-2.5 py-1 text-xs font-medium transition-colors",
                    level === l.value
                      ? "bg-grass text-cream"
                      : "bg-grass-50 text-stone hover:text-ink"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Field label="Your UTR" value={formatUTR(playerUtr)}>
              <Slider
                value={playerUtr}
                min={UTR_MIN}
                max={UTR_MAX}
                step={0.25}
                onChange={setPlayerUtr}
                aria-label="Your UTR"
              />
            </Field>
            <Field label="Draw strength (avg UTR)" value={formatUTR(drawUtr)}>
              <Slider
                value={drawUtr}
                min={UTR_MIN}
                max={UTR_MAX}
                step={0.25}
                onChange={setDrawUtr}
                aria-label="Average entrant UTR"
              />
            </Field>
            <Field
              label="Travel one-way"
              value={travelHours < 1 ? `${Math.round(travelHours * 60)} min` : `${travelHours} hr${travelHours >= 2 ? "s" : ""}`}
            >
              <Slider
                value={travelHours}
                min={0}
                max={10}
                step={0.5}
                onChange={setTravelHours}
                aria-label="Travel hours"
              />
            </Field>
            <Field label="Entry + travel cost" value={`$${totalCost}`}>
              <Slider
                value={totalCost}
                min={0}
                max={1500}
                step={25}
                onChange={setTotalCost}
                aria-label="Total cost"
              />
            </Field>
          </div>

          <p className="mt-6 border-t-hairline border-line pt-4 text-sm leading-relaxed text-stone">
            {headline}
          </p>
        </div>

        {/* live verdict */}
        <div className="flex flex-col justify-between gap-6 border-t-hairline border-line bg-cream/60 p-6 sm:p-8 lg:border-l-hairline lg:border-t-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-light">
              Verdict
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={result.verdict}
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "mt-3 flex items-center gap-3 rounded-card border p-4",
                  verdict.wrap
                )}
              >
                <Icon className="h-6 w-6 shrink-0" />
                <div>
                  <p className="text-lg font-semibold leading-tight tracking-wide">
                    {verdict.label}
                  </p>
                  <p className="text-xs opacity-80">fit score {result.score}/100</p>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-5 space-y-2.5">
              <MiniBar label="Competition" value={result.competitionScore} />
              <MiniBar label="Cost value" value={result.costScore} />
              <MiniBar label="Travel" value={result.travelScore} />
            </div>
          </div>

          <Link
            href="/tournament-fit"
            className="group flex items-center justify-center gap-2 rounded-pill bg-grass px-5 py-3 text-sm font-medium text-cream transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            Open the full finder
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-medium text-stone-light">{label}</span>
        <span className="text-sm font-medium text-grass">{value}</span>
      </div>
      {children}
    </div>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-stone">
        <span>{label}</span>
        <span className="font-medium text-ink">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-grass-50">
        <motion.div
          className="h-full rounded-pill bg-leaf-accent"
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
