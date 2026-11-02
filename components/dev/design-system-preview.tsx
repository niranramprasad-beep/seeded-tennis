"use client";

import { useState } from "react";
import { Check, Compass, Mail, Route, School, Sparkles } from "lucide-react";
import { Reveal } from "@/components/shared/reveal";
import { Magnetic } from "@/components/shared/magnetic";
import { CountUpOnView } from "@/components/shared/count-up-on-view";
import { SpotlightCard } from "@/components/shared/spotlight-card";
import { GradientMeshBg } from "@/components/seeded/shared/gradient-mesh-bg";
import { CursorGlowField } from "@/components/seeded/shared/cursor-glow-field";
import { BentoGrid, BentoCell } from "@/components/seeded/shared/bento-grid";

type Mode = "dark" | "light";

const COLOR_GROUPS: { label: string; tokens: { name: string; var: string }[] }[] = [
  {
    label: "Surface",
    tokens: [
      { name: "bg", var: "--c-bg" },
      { name: "card", var: "--c-card" },
      { name: "line", var: "--c-line" },
    ],
  },
  {
    label: "Primary",
    tokens: [
      { name: "primary-50", var: "--c-primary-50" },
      { name: "primary-100", var: "--c-primary-100" },
      { name: "primary-600", var: "--c-primary-600" },
      { name: "primary (700)", var: "--c-primary" },
      { name: "primary-800", var: "--c-primary-800" },
      { name: "primary-900", var: "--c-primary-900" },
    ],
  },
  {
    label: "Text",
    tokens: [
      { name: "ink", var: "--c-ink" },
      { name: "stone", var: "--c-stone" },
      { name: "stone-light", var: "--c-stone-light" },
    ],
  },
  {
    label: "Secondary accents",
    tokens: [
      { name: "leaf", var: "--c-leaf" },
      { name: "lime", var: "--c-lime" },
      { name: "tennis", var: "--c-tennis" },
      { name: "gold", var: "--c-gold" },
    ],
  },
  {
    label: "Semantic",
    tokens: [
      { name: "error-bg", var: "--c-error-bg" },
      { name: "error", var: "--c-error" },
      { name: "error-strong", var: "--c-error-strong" },
    ],
  },
];

export function DesignSystemPreview() {
  const [mode, setMode] = useState<Mode>("dark");

  return (
    <div data-design="seeded" data-seeded-mode={mode} className="min-h-screen bg-cream text-ink">
      {/* ---- header / mode toggle ---- */}
      <header className="seeded-glass border-b-0">
        <div className="mx-auto flex max-w-content items-center justify-between container-px py-4">
          <div>
            <span className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
              Internal — /dev/design
            </span>
            <h1 className="font-seeded text-2xl font-semibold tracking-tight text-ink">
              Seeded design system
            </h1>
          </div>
          <div className="inline-flex rounded-pill border-[0.5px] border-[rgb(var(--c-line))] bg-card p-1">
            {(["dark", "light"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="rounded-pill px-4 py-1.5 font-seeded text-sm capitalize transition-colors"
                style={mode === m ? { background: "var(--s-accent-gradient)", color: "white" } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-content space-y-24 container-px py-16">
        {/* ---- hero demo: gradient mesh + cursor glow + scroll reveal ---- */}
        <CursorGlowField className="relative overflow-hidden rounded-[32px]">
          <section className="relative flex min-h-[46vh] flex-col items-start justify-center overflow-hidden rounded-[32px] p-12">
            <GradientMeshBg />
            <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-grid-dots opacity-40" />
            <Reveal className="relative">
              <span className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
                Under the lights
              </span>
              <h2 className="mt-4 text-balance font-seeded text-5xl font-semibold leading-[0.95] tracking-tight text-ink sm:text-6xl">
                A night match in a <span className="seeded-gradient-text">stadium</span>.
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-stone">
                Court green, optic-yellow highlights sparingly, full-bleed ambient
                mesh, cursor-tracked glow. Move your mouse over this box.
              </p>
            </Reveal>
          </section>
        </CursorGlowField>

        {/* ---- colors ---- */}
        <section>
          <SectionHeader eyebrow="Tokens" title="Color" />
          <div className="mt-8 space-y-8">
            {COLOR_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="font-seeded text-sm font-medium text-stone">{group.label}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {group.tokens.map((t) => (
                    <div key={t.name} className="seeded-glass overflow-hidden rounded-2xl">
                      <div className="h-16" style={{ background: `rgb(var(${t.var}))` }} />
                      <div className="p-3">
                        <p className="font-mono text-xs text-ink">{t.name}</p>
                        <p className="font-mono text-[10px] text-stone-light">{t.var}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="font-seeded text-sm font-medium text-stone">Accent gradient</p>
              <div
                className="mt-3 h-16 w-full max-w-sm rounded-2xl"
                style={{ background: "var(--s-accent-gradient)" }}
              />
            </div>
          </div>
        </section>

        {/* ---- typography ---- */}
        <section>
          <SectionHeader eyebrow="Tokens" title="Typography" />
          <div className="mt-8 space-y-6">
            <div>
              <p className="mb-2 font-mono text-xs text-stone-light">font-seeded (Geist) — display, 7xl/semibold</p>
              <p className="font-seeded text-7xl font-semibold leading-[0.95] tracking-tight text-ink">
                Find your fit.
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-stone-light">font-seeded — headline, 4xl/semibold</p>
              <p className="font-seeded text-4xl font-semibold tracking-tight text-ink">
                Everything recruiting asks of you.
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-stone-light">font-seeded — body, base/medium</p>
              <p className="max-w-xl font-seeded text-base text-stone">
                Your UTR, academics, and target division — turned into an honest,
                roster-matched recruiting plan.
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-stone-light">font-mono (IBM Plex Mono) — stat numbers, tabular</p>
              <p className="font-mono text-5xl text-ink">
                <CountUpOnView value={10.5} decimals={1} className="font-mono text-5xl text-ink" />
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-stone-light">eyebrow label</p>
              <p className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
                College tennis recruiting
              </p>
            </div>
          </div>
        </section>

        {/* ---- buttons ---- */}
        <section>
          <SectionHeader eyebrow="Components" title="Buttons" />
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Magnetic strength={0.3}>
              <button
                className="flex items-center gap-2 rounded-pill px-6 py-3.5 font-seeded text-sm font-semibold text-white shadow-seeded-2"
                style={{ background: "var(--s-accent-gradient)" }}
              >
                Primary (magnetic)
                <Sparkles className="h-4 w-4" />
              </button>
            </Magnetic>
            <button className="seeded-glass rounded-pill px-6 py-3.5 font-seeded text-sm font-semibold text-ink">
              Glass outline
            </button>
            <button className="rounded-pill px-6 py-3.5 font-seeded text-sm font-semibold text-stone transition-colors hover:text-ink">
              Ghost
            </button>
            <button
              className="flex items-center gap-2 rounded-pill px-6 py-3.5 font-seeded text-sm font-semibold text-white"
              style={{ background: "rgb(var(--c-error))" }}
            >
              Destructive
              <Check className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* ---- cards / elevation ---- */}
        <section>
          <SectionHeader eyebrow="Components" title="Cards & elevation" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((level) => (
              <div
                key={level}
                className="seeded-glass rounded-[22px] p-6"
                style={{ boxShadow: `var(--s-elevation-${level})` }}
              >
                <p className="font-mono text-xs text-stone-light">shadow-seeded-{level}</p>
                <p className="mt-2 font-seeded text-sm text-ink">Elevation level {level}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <SpotlightCard className="seeded-glass rounded-[22px] p-8">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-white"
                style={{ background: "var(--s-accent-gradient)" }}
              >
                <Sparkles className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-seeded text-xl font-medium text-ink">SpotlightCard</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-stone">
                Move your cursor across this card — the glow tracks it. Shared with
                Legacy, var-driven, no Seeded-specific fork needed.
              </p>
            </SpotlightCard>
          </div>
        </section>

        {/* ---- bento grid ---- */}
        <section>
          <SectionHeader eyebrow="Layout" title="Bento grid" />
          <BentoGrid className="mt-8">
            {[
              { icon: School, title: "School matching", span: 8 as const },
              { icon: Route, title: "Roadmap", span: 4 as const },
              { icon: Compass, title: "Tournament fit", span: 4 as const },
              { icon: Mail, title: "Coach outreach", span: 8 as const },
            ].map((item) => (
              <BentoCell key={item.title} span={item.span}>
                <Reveal className="h-full">
                  <SpotlightCard className="seeded-glass flex h-full flex-col justify-center rounded-[22px] p-6 shadow-seeded-1">
                    <item.icon className="h-5 w-5 text-grass" />
                    <p className="mt-3 font-seeded text-base font-medium text-ink">{item.title}</p>
                  </SpotlightCard>
                </Reveal>
              </BentoCell>
            ))}
          </BentoGrid>
        </section>

        {/* ---- motion stagger demo ---- */}
        <section>
          <SectionHeader eyebrow="Motion" title="Reveal stagger" />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Reveal key={i} index={i} step={0.08}>
                <div className="seeded-glass flex h-24 items-center justify-center rounded-2xl font-mono text-sm text-ink">
                  {`0${i + 1}`}
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-4 text-sm text-stone">
            Scroll this section out of view and back to re-trigger (once per
            mount — same `Reveal` primitive used everywhere else).
          </p>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <span className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
        {eyebrow}
      </span>
      <h2 className="mt-2 font-seeded text-3xl font-semibold tracking-tight text-ink">{title}</h2>
    </div>
  );
}
