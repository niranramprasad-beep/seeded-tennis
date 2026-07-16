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

const DEADLINE_YEAR_BY_CLASS: Record<number, number> = {
  2026: 2025,
  2027: 2026,
  2028: 2027,
  2029: 2028,
};

// Minimum realistic recruiting bands by the summer before senior year.
// Top programs run higher, but this is a better "can I start conversations?"
// threshold than using final college roster averages.
const TARGET_BAND: Record<Division, number> = { D1: 10.8, D2: 9.2, D3: 7.8 };
const STRONG_BAND: Record<Division, number> = { D1: 12.2, D2: 10.5, D3: 9.2 };

function annualGrowth(utr: number): number {
  if (utr < 5) return 1.05;
  if (utr < 7) return 0.9;
  if (utr < 9) return 0.7;
  if (utr < 11) return 0.5;
  if (utr < 13) return 0.33;
  return 0.18;
}

function gradeFromGradYear(gradYear: number): number {
  // As of the 2025-26 school year, the class of 2026 are seniors (12th grade),
  // so a 9th grader graduates in 2029.
  return clamp(12 - (gradYear - 2026), 8, 12);
}

export function RecruitingFitPanel() {
  const [utr, setUtr] = useState(7.5);
  const [gpa, setGpa] = useState(3.7);
  const [gradYear, setGradYear] = useState(2028);
  const [division, setDivision] = useState<Division>("D3");

  const fit = useMemo(() => {
    const gradeNow = gradeFromGradYear(gradYear);
    const deadlineYear = DEADLINE_YEAR_BY_CLASS[gradYear] ?? gradYear - 1;
    const currentYear = 2026;
    const yearsToDeadline = clamp(deadlineYear - currentYear + 0.25, 0, 3);
    const projectedDeadline = Math.min(16, utr + yearsToDeadline * annualGrowth(utr));
    const target = TARGET_BAND[division];
    const strong = STRONG_BAND[division];
    const tennisGap = projectedDeadline - target;
    const strongGap = projectedDeadline - strong;

    const tennisScore = clamp(50 + tennisGap * 24, 4, 98);
    const academicScore = clamp(50 + (gpa - 3.2) * 28, 15, 96);
    const score = Math.round(tennisScore * 0.72 + academicScore * 0.28);

    let label: string;
    if (projectedDeadline >= 13.8 && division === "D1") {
      label = "Power D1 range";
    } else if (strongGap >= 0) {
      label = `Strong ${division} range`;
    } else if (tennisGap >= 0) {
      label = `Recruitable ${division} fit`;
    } else if (tennisGap >= -0.8) {
      label = `Close ${division} reach`;
    } else {
      label = `${division} stretch`;
    }

    return {
      score: clamp(score, 4, 98),
      label,
      gap: Math.max(0, target - projectedDeadline),
      target,
      gradeNow,
    };
  }, [division, gpa, gradYear, utr]);

  return (
    <div className="rounded-card border-hairline border-line bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-grass">Fit check</p>
        <span className="text-sm font-medium text-[#0E6A7A]">{fit.label}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field icon={Gauge} label="UTR" value={utr.toFixed(1)}>
          <Slider value={utr} min={1} max={16} step={0.1} onChange={setUtr} aria-label="UTR" className="mt-3" />
        </Field>
        <Field icon={GraduationCap} label="GPA" value={gpa.toFixed(1)}>
          <Slider value={gpa} min={2} max={4} step={0.1} onChange={setGpa} aria-label="GPA" className="mt-3" />
        </Field>
        <Field icon={School} label="Grad year" value={`${gradYear}`}>
          <div className="mt-2.5 grid grid-cols-4 gap-1.5">
            {[2026, 2027, 2028, 2029].map((year) => (
              <button
                key={year}
                onClick={() => setGradYear(year)}
                className={cn(
                  "rounded-pill px-2 py-1.5 text-xs font-medium transition-colors",
                  gradYear === year ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
                )}
              >
                {year}
              </button>
            ))}
          </div>
        </Field>
        <Field icon={ShieldCheck} label="Division" value={division}>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {divisions.map((item) => (
              <button
                key={item}
                onClick={() => setDivision(item)}
                className={cn(
                  "rounded-pill px-2 py-1.5 text-xs font-medium transition-colors",
                  division === item ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-5 rounded-card border-hairline border-line bg-cream/60 p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-serif text-5xl leading-none text-ink">{fit.score}</p>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-light">
              confidence score
            </p>
          </div>
          <p className="text-sm font-medium text-stone">
            {fit.gap > 0 ? `${fit.gap.toFixed(1)} UTR to go` : "Band cleared"}
          </p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-pill bg-grass-50">
          <div
            className="h-full rounded-pill bg-gradient-to-r from-tennis to-grass transition-[width] duration-500"
            style={{ width: `${fit.score}%` }}
          />
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
    <div className="rounded-card border-hairline border-line bg-cream/40 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-stone">
          <Icon className="h-3.5 w-3.5 text-gold" />
          {label}
        </p>
        <span className="text-sm font-medium text-ink">{value}</span>
      </div>
      {children}
    </div>
  );
}
