"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Gauge, GraduationCap, School, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const divisions = ["D1", "D2", "D3"] as const;
type Division = (typeof divisions)[number];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Senior-year competitive band per division — the UTR a recruit realistically
// needs by the time they arrive on campus. (Blended across men's/women's and
// program tiers; top D1 runs higher, low D1 a touch lower.)
const SENIOR_BAND: Record<Division, number> = { D1: 12.0, D2: 10.2, D3: 8.5 };

// UTR development tapers as you climb: a 7.0 junior improves faster than a 13.0
// junior who is already near their ceiling. Returns expected UTR gain per year.
function growthPerYear(utr: number): number {
  return clamp(0.9 - (utr - 7) * 0.06, 0.2, 0.9);
}

function gradeFromGradYear(gradYear: number): number {
  // As of the 2025-26 school year, the class of 2026 are seniors (12th grade),
  // so a 9th grader graduates in 2029.
  return clamp(12 - (gradYear - 2026), 8, 12);
}

const GRADE_LABEL: Record<number, string> = {
  8: "8th grade",
  9: "9th grade",
  10: "10th grade",
  11: "11th grade",
  12: "12th grade",
};

export function RecruitingFitPanel() {
  const [utr, setUtr] = useState(7.5);
  const [gpa, setGpa] = useState(3.7);
  const [gradYear, setGradYear] = useState(2028);
  const [division, setDivision] = useState<Division>("D3");

  const fit = useMemo(() => {
    const gradeNow = gradeFromGradYear(gradYear);
    const yearsLeft = Math.max(0, 12 - gradeNow);

    // Project the player's UTR forward with a tapering growth curve, then judge
    // that projection against the division's senior-year band.
    const projectedSenior = Math.min(16, utr + yearsLeft * growthPerYear(utr));
    const band = SENIOR_BAND[division];
    const aheadBy = projectedSenior - band; // + = clears the bar, - = short

    // GPA is a real recruiting lever (eligibility, academic-index schools).
    const gpaAdj = clamp((gpa - 3.3) * 18, -18, 18);

    let score = Math.round(64 + aheadBy * 20 + gpaAdj);
    let label: string;

    if (projectedSenior >= 15) {
      label = "Professional level";
      score = Math.max(score, 98);
    } else if (aheadBy >= 0.8) {
      label = `Lock for ${division}`;
    } else if (aheadBy >= 0) {
      label = `Strong ${division} match`;
    } else if (aheadBy >= -1) {
      label = `Developing — ${division} reach`;
    } else {
      label = `Long reach for ${division}`;
    }

    score = clamp(score, 5, 99);
    const gap = Math.max(0, band - projectedSenior);

    return { score, label, gap, band, projectedSenior, gradeNow };
  }, [division, gpa, gradYear, utr]);

  return (
    <div className="rounded-card border-hairline border-line bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow text-gold">Fit check</p>
          <h2 className="mt-1.5 font-serif text-2xl text-ink">
            Where do you realistically fit?
          </h2>
        </div>
        <span className="shrink-0 rounded-pill border-hairline border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-medium text-gold">
          Live estimate
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Field icon={Gauge} label="UTR" value={utr.toFixed(1)}>
          <Slider value={utr} min={1} max={16} step={0.1} onChange={setUtr} aria-label="UTR" className="mt-3.5" />
        </Field>
        <Field icon={GraduationCap} label="GPA" value={gpa.toFixed(1)}>
          <Slider value={gpa} min={2} max={4} step={0.1} onChange={setGpa} aria-label="GPA" className="mt-3.5" />
        </Field>
        <Field icon={School} label="Grad year" value={`${gradYear} · ${GRADE_LABEL[fit.gradeNow]}`}>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {[2026, 2027, 2028, 2029].map((year) => (
              <button
                key={year}
                onClick={() => setGradYear(year)}
                className={cn(
                  "rounded-pill px-2 py-1.5 text-xs transition-colors",
                  gradYear === year ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
                )}
              >
                {year}
              </button>
            ))}
          </div>
        </Field>
        <Field icon={ShieldCheck} label="Division" value={division}>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {divisions.map((item) => (
              <button
                key={item}
                onClick={() => setDivision(item)}
                className={cn(
                  "rounded-pill px-2 py-1.5 text-xs transition-colors",
                  division === item ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-5 overflow-hidden rounded-card border-hairline border-line bg-cream/60">
        <div className="flex items-center justify-between border-b-hairline border-line px-4 py-3">
          <span className="text-sm text-stone">Projected recruiting fit</span>
          <span className="text-sm font-medium text-grass">{fit.label}</span>
        </div>
        <div className="p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-light tracking-tight text-ink">{fit.score}</p>
              <p className="eyebrow mt-1">confidence score</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-medium text-ink">
                {fit.gap > 0 ? `${fit.gap.toFixed(1)} UTR to the band` : "Clears the band"}
              </p>
              <p className="mt-0.5 text-xs text-stone-light">
                proj. senior {fit.projectedSenior.toFixed(1)} · {division} band {fit.band.toFixed(1)}
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-pill bg-grass-50">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-leaf-accent to-grass transition-[width] duration-500"
              style={{ width: `${fit.score}%` }}
            />
          </div>
        </div>
      </div>

      <Link href="/signup" className="group mt-5 block">
        <Button variant="primary" size="lg" className="w-full">
          Build full roadmap
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Button>
      </Link>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-card border-hairline border-line bg-cream/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-stone">
          <Icon className="h-4 w-4 text-gold" />
          {label}
        </p>
        <span className="text-right text-xs font-medium text-ink">{value}</span>
      </div>
      {children}
    </div>
  );
}
