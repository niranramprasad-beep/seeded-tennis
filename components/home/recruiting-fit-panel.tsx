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

    const neededGain = Math.max(0, target - utr);
    const monthlyPace =
      yearsToDeadline > 0 ? neededGain / Math.max(1, yearsToDeadline * 12) : neededGain;

    return {
      score: clamp(score, 4, 98),
      label,
      gap: Math.max(0, target - projectedDeadline),
      target,
      strong,
      projectedDeadline,
      gradeNow,
      deadlineYear,
      monthlyPace,
    };
  }, [division, gpa, gradYear, utr]);

  return (
    <div className="rounded-[28px] border-hairline border-cream/45 bg-[#F8F6EE]/96 p-5 text-ink shadow-[0_28px_80px_rgba(0,0,0,0.24)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow text-gold">Fit check</p>
          <h2 className="mt-1.5 font-serif text-2xl text-ink">
            Where do you realistically fit?
          </h2>
        </div>
        <span className="shrink-0 rounded-pill border-hairline border-[#38D7F2]/35 bg-[#38D7F2]/10 px-3 py-1 text-[11px] font-medium text-[#0E6A7A]">
          Summer checkpoint
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
                  gradYear === year ? "bg-[#1A5FB8] text-cream" : "bg-[#EAF7F8] text-stone hover:text-ink"
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
                  division === item ? "bg-[#1A5FB8] text-cream" : "bg-[#EAF7F8] text-stone hover:text-ink"
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-5 overflow-hidden rounded-card border-hairline border-line bg-white/72">
        <div className="flex items-center justify-between border-b-hairline border-line px-4 py-3">
          <span className="text-sm font-medium text-stone">Fit by summer before senior year</span>
          <span className="text-sm font-medium text-[#0E6A7A]">{fit.label}</span>
        </div>
        <div className="p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-light tracking-tight text-ink">{fit.score}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone">confidence score</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-medium text-ink">
                {fit.gap > 0 ? `${fit.gap.toFixed(1)} UTR short` : "Clears the recruitable band"}
              </p>
              <p className="mt-0.5 text-xs text-stone">
                proj. {fit.projectedDeadline.toFixed(1)} by summer {fit.deadlineYear} · target {fit.target.toFixed(1)}
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-pill bg-grass-50">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-tennis via-[#38D7F2] to-[#1A5FB8] transition-[width] duration-500"
              style={{ width: `${fit.score}%` }}
            />
          </div>
          <p className="mt-3 text-xs font-medium leading-relaxed text-stone">
            Needed pace from today: {fit.monthlyPace.toFixed(2)} UTR/month to reach the recruitable {division} band.
          </p>
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
    <div className="rounded-card border-hairline border-line bg-white/68 p-4">
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
