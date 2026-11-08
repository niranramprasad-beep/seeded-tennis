"use client";

import { useState } from "react";
import { SeededButton } from "@/components/seeded/ui/button";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { DataChip } from "@/components/seeded/ui/data-chip";
import { RangeBar } from "@/components/seeded/ui/range-bar";
import { ActionCard } from "@/components/seeded/ui/action-card";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// Pixel check target for Phase 1 — mirrors DesignSystem.dc.html section for
// section (Color, Type, Components, Spacing/radius/motion), built from the
// real components/seeded/ui/* primitives rather than re-describing the
// mockup. Internal tool only — see app/dev/design/page.tsx (404s in prod).

const COLOR_SWATCHES: { name: string; hex: string; bg: string }[] = [
  { name: "bg", hex: "#F7F6F2", bg: "bg-cream" },
  { name: "surface", hex: "#FFFFFF", bg: "bg-card" },
  { name: "ink", hex: "#14181A", bg: "bg-ink" },
  { name: "ink-2", hex: "#5C625F", bg: "bg-stone" },
  { name: "primary · court", hex: "#1F6B4A", bg: "bg-grass" },
  { name: "accent · ball", hex: "#D7F25A", bg: "bg-lime-accent" },
  { name: "clay · reach", hex: "#C2643A", bg: "bg-leaf-accent" },
  { name: "warning", hex: "#B7791F", bg: "bg-gold" },
  { name: "error", hex: "#C2362F", bg: "bg-error" },
  { name: "dark bg", hex: "#0E1411", bg: "bg-grass-900" },
];

const SPACING_STEPS = [4, 8, 12, 16, 24, 32, 48, 64];

export function DesignSystemPreview() {
  const [done, setDone] = useState(false);

  return (
    <div className="min-h-[1300px] w-full bg-cream font-sans text-ink">
      <main className="mx-auto flex max-w-[1280px] flex-col gap-10 px-8 py-12">
        <div>
          <h1 className="font-seeded text-[40px] tracking-[-0.02em] text-ink">
            Seeded · Scoreboard calm
          </h1>
          <p className="mt-2 text-base text-stone">
            Court green for action, ball yellow for &quot;you&quot;, clay for reach. Numbers in mono. One accent per screen.
          </p>
        </div>

        {/* ---------------------------------------------------------- Color */}
        <section>
          <SectionLabel>Color</SectionLabel>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-4">
            {COLOR_SWATCHES.map((c) => (
              <div key={c.name} className="flex flex-col gap-1.5 text-xs text-stone">
                <div className={`h-16 rounded-[10px] border border-line ${c.bg}`} />
                <strong className="text-ink">{c.name}</strong>
                <span className="font-mono tabular-nums">{c.hex}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------- Type */}
        <section>
          <SectionLabel>Type</SectionLabel>
          <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-card p-7">
            <div className="font-seeded text-[56px] font-bold leading-[1.05] tracking-[-0.03em]">
              Display 56 / 36
            </div>
            <div className="font-seeded text-4xl font-semibold tracking-[-0.02em]">H1 36 / 28</div>
            <div className="text-2xl font-semibold">H2 24 / 20</div>
            <div className="max-w-[640px] text-base leading-[1.55]">
              Body 16. Plain sentences, short paragraphs. A number a family will act on never
              goes below 14px or below 4.5:1 contrast.
            </div>
            <div className="font-mono text-sm tabular-nums">Table numeral · UTR 9.42 · $1,840 · Nov 3</div>
          </div>
        </section>

        {/* ----------------------------------------------------- Components */}
        <section>
          <SectionLabel>Components</SectionLabel>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-5">
            <Card title="Buttons">
              <div className="flex flex-wrap items-center gap-2.5">
                <SeededButton variant="primary">Primary</SeededButton>
                <SeededButton variant="secondary">Secondary</SeededButton>
                <SeededButton variant="ghost">Ghost</SeededButton>
                <SeededButton variant="primary" className="outline outline-2 outline-offset-2 outline-lime-accent">
                  Focus
                </SeededButton>
                <SeededButton variant="primary" disabled>
                  Disabled
                </SeededButton>
              </div>
            </Card>

            <Card title="Fit bands and data chips">
              <div className="flex flex-wrap gap-2">
                <FitBadge band="reach" />
                <FitBadge band="target" />
                <FitBadge band="likely" />
                <FitBadge band="out-of-range" />
                <FitBadge band="unverified" />
              </div>
              <div className="flex flex-wrap gap-2">
                <DataChip status="verified">Verified Oct 12</DataChip>
                <DataChip status="updated">Updated 12d ago</DataChip>
                <DataChip status="estimated">Estimated</DataChip>
                <DataChip status="missing">4 of 9 have UTR</DataChip>
              </div>
            </Card>

            <Card title="Range bar (signature component)">
              <RangeBar
                rangeStartPct={20}
                rangeEndPct={70}
                medianPct={48}
                youPct={42}
                caption="Team 8.8–10.6 · median tick · you 9.4"
              />
            </Card>

            <Card title="Inputs">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
                Current UTR
                <input
                  defaultValue="9.4"
                  className="h-11 rounded-md border border-[#D6D3C8] px-3 font-mono text-base text-ink"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-stone">
                Entry fee
                <input
                  aria-invalid="true"
                  className="h-11 rounded-md border-2 border-error px-3 text-base text-ink"
                />
                <span className="text-error">Enter a fee, or choose &quot;Not sure&quot; to estimate it.</span>
              </label>
            </Card>

            <Card title="Action card">
              <ActionCard
                title="Follow up with Middlebury"
                description="No reply in 14 days."
                estimate="5 min"
                doneLabel="Follow-up sent"
                onAction={() => setDone(true)}
              />
              {done && (
                <p className="text-xs text-stone-light">Marked done — undo is available for 5 seconds.</p>
              )}
            </Card>

            <Card title="Empty, loading, error">
              <EmptyState
                title="No target schools yet."
                description="Here are 10 that fit your level."
                action={{ label: "Add all", href: "#" }}
              />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-[70%] rounded-md" />
                <Skeleton className="h-3 w-[45%] rounded-md" />
              </div>
              <div className="rounded-[10px] border border-[#F0C3BF] bg-[#FCEEED] p-3.5 text-sm text-[#8E2620]">
                Couldn&apos;t load rosters. Your saved schools are safe.{" "}
                <a href="#" className="font-semibold">
                  Try again
                </a>
              </div>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------- Spacing/radius/motion */}
        <section>
          <SectionLabel>Spacing · radius · motion</SectionLabel>
          <div className="flex flex-wrap items-end gap-7 rounded-xl border border-line bg-card p-6">
            <div className="flex items-end gap-2.5">
              {SPACING_STEPS.map((px) => (
                <div key={px} className="bg-grass" style={{ width: px, height: px }} />
              ))}
            </div>
            <span className="font-mono text-[13px] tabular-nums text-stone">
              4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96
            </span>
            <span className="text-sm text-stone">
              Radius 6 / 10 / pill · Motion 100–240ms, no count-ups on prices or ratings, respects
              reduced motion
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-stone">
      {children}
    </h2>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-card p-6">
      <strong className="text-ink">{title}</strong>
      {children}
    </div>
  );
}
