"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, BarChart3, Clock3, ShieldCheck } from "lucide-react";
import type { SchoolLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/shared/reveal";
import { Magnetic } from "@/components/shared/magnetic";
import { Parallax } from "@/components/shared/parallax";
import { CountUpOnView } from "@/components/shared/count-up-on-view";
import { SpotlightCard } from "@/components/shared/spotlight-card";
import { GradientMeshBg } from "@/components/premium/shared/gradient-mesh-bg";
import { ScrollHeroSequence } from "@/components/premium/shared/scroll-hero";
import { CursorGlowField } from "@/components/premium/shared/cursor-glow-field";
import { BentoGrid, BentoCell } from "@/components/premium/shared/bento-grid";
import { SchoolMarquee } from "@/components/home/school-marquee";
import { CinematicBand } from "@/components/home/cinematic-band";
import { FitFinderTeaser } from "@/components/home/fit-finder-teaser";
import { RecruitingFitPanel } from "@/components/home/recruiting-fit-panel";
import { Footer } from "@/components/layout/footer";
import { CAPABILITIES, METHODOLOGY, LOOP } from "@/components/home/home-content";

// A genuinely different composition from Legacy's home page
// (components/home/legacy-home-view.tsx) — a full-bleed ambient hero with
// scroll/cursor reactivity, asymmetric bento grids instead of uniform
// strips, glass panels throughout. Shares the same content (home-content.ts)
// and the same complex interactive sub-widgets (FitFinderTeaser,
// RecruitingFitPanel, SchoolMarquee, CinematicBand) — those already reuse
// theme CSS vars, so they don't need a Premium fork of their own.
export function PremiumHomeView({ marqueeSchools }: { marqueeSchools: SchoolLite[] }) {
  return (
    <>
      <div className="text-ink">
        {/* ----------------------------------------------------------- HERO */}
        <CursorGlowField className="relative overflow-hidden">
          <section className="relative flex min-h-[94vh] items-center overflow-hidden">
            <GradientMeshBg />
            <div className="pointer-events-none absolute inset-0 bg-grid-dots opacity-40" />
            <ScrollHeroSequence className="relative mx-auto grid w-full max-w-content items-center gap-14 container-px py-32 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <Reveal index={0} step={0.09}>
                  <span className="font-premium text-xs font-semibold uppercase tracking-[0.2em] text-stone">
                    College tennis recruiting
                  </span>
                </Reveal>
                <Reveal index={1} step={0.09}>
                  <h1 className="mt-6 text-balance font-premium text-6xl font-semibold leading-[0.95] tracking-tight text-ink sm:text-7xl lg:text-8xl">
                    Find where you{" "}
                    <span className="premium-gradient-text">realistically</span> fit.
                  </h1>
                </Reveal>
                <Reveal index={2} step={0.09}>
                  <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-stone">
                    Your UTR, academics, and target division — turned into an
                    honest, roster-matched recruiting plan.
                  </p>
                </Reveal>
                <Reveal index={3} step={0.09}>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <Magnetic strength={0.3}>
                      <Link
                        href="/signup"
                        className="group flex items-center justify-center gap-2 rounded-pill px-6 py-3.5 font-premium text-sm font-semibold text-on-primary shadow-premium-2"
                        style={{ background: "var(--p-accent-gradient)" }}
                      >
                        Build my fit report
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                      </Link>
                    </Magnetic>
                    <Link
                      href="/schools"
                      className="premium-glass group flex items-center justify-center gap-2 rounded-pill px-6 py-3.5 font-premium text-sm font-semibold text-ink"
                    >
                      Browse schools free
                      <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                  </div>
                </Reveal>

                <Reveal index={4} step={0.09}>
                  <div className="mt-14 flex max-w-lg gap-8 border-t border-[rgb(var(--c-line))] pt-6">
                    <div>
                      <p className="font-mono text-3xl text-ink sm:text-4xl">
                        <CountUpOnView value={67} className="font-mono text-3xl text-ink sm:text-4xl" />
                      </p>
                      <p className="mt-1.5 whitespace-nowrap font-premium text-[10px] font-semibold uppercase tracking-[0.14em] text-stone">
                        programs ranked
                      </p>
                    </div>
                    {[
                      ["D1–D3", "men's & women's"],
                      ["1–16.5", "full UTR scale"],
                    ].map(([value, label]) => (
                      <div key={label}>
                        <p className="font-mono text-3xl text-ink sm:text-4xl">{value}</p>
                        <p className="mt-1.5 whitespace-nowrap font-premium text-[10px] font-semibold uppercase tracking-[0.14em] text-stone">
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                </Reveal>
              </div>

              <Reveal index={2} step={0.12}>
                <div className="relative mx-auto max-w-md lg:max-w-none">
                  <Parallax offset={16}>
                    <div className="premium-glass overflow-hidden rounded-[32px] shadow-premium-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/images/hero-celebration.jpg"
                        alt="Tennis player mid-match, full extension on a forehand"
                        className="aspect-[4/5] w-full object-cover"
                      />
                    </div>
                  </Parallax>
                  <div
                    className="premium-glass absolute -left-4 bottom-8 animate-float rounded-2xl px-4 py-3 shadow-premium-2 sm:-left-8"
                    style={{ animationDelay: "0.4s" }}
                  >
                    <p className="font-premium text-[10px] font-semibold uppercase tracking-[0.14em] text-stone">
                      Roadmap
                    </p>
                    <p className="mt-0.5 font-mono text-xl text-ink">
                      UTR 8.2 <span className="premium-gradient-text">→ 10.5</span>
                    </p>
                    <p className="text-xs text-stone">by summer before senior year</p>
                  </div>
                  <div className="premium-glass absolute -right-3 top-8 flex animate-float items-center gap-2 rounded-pill px-4 py-2.5 shadow-premium-2 sm:-right-6">
                    <span className="h-2 w-2 rounded-full" style={{ background: "var(--p-accent-gradient)" }} />
                    <p className="font-premium text-sm font-medium text-ink">
                      Tournament: <span className="premium-gradient-text">good fit</span>
                    </p>
                  </div>
                </div>
              </Reveal>
            </ScrollHeroSequence>
          </section>
        </CursorGlowField>

        {/* -------------------------------------------------------- TRUST STRIP */}
        <section className="premium-glass border-y-0">
          <div className="mx-auto flex max-w-content flex-col gap-3 container-px py-4 font-premium text-sm text-stone sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-grass" />
              Rosters reviewed recently
            </p>
            <span className="hidden h-4 w-px bg-[rgb(var(--c-line))] sm:block" />
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-grass" />
              Confidence bands, never guarantees
            </p>
            <span className="hidden h-4 w-px bg-[rgb(var(--c-line))] sm:block" />
            <p className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-grass" />
              Full 1–16.5 UTR scale
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- CAPABILITIES (bento) */}
        <section className="mx-auto max-w-content container-px py-24">
          <Reveal className="max-w-2xl">
            <span className="font-premium text-xs font-semibold uppercase tracking-[0.2em] text-stone">
              What you get
            </span>
            <h2 className="mt-4 font-premium text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Everything recruiting asks of you.
            </h2>
          </Reveal>

          <BentoGrid className="mt-10">
            {CAPABILITIES.map((item, i) => (
              <BentoCell key={item.title} span={i === 0 || i === 3 ? 8 : 4}>
                <Reveal index={i} step={0.06} className="h-full">
                  <SpotlightCard className="premium-glass flex h-full flex-col justify-between rounded-[26px] p-8 shadow-premium-1">
                    <div>
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-full text-on-primary"
                        style={{ background: "var(--p-accent-gradient)" }}
                      >
                        <item.icon className="h-5 w-5" />
                      </span>
                      <h3 className="mt-6 font-premium text-xl font-medium text-ink">{item.title}</h3>
                      <p className="mt-2 max-w-sm text-sm leading-relaxed text-stone">{item.body}</p>
                    </div>
                  </SpotlightCard>
                </Reveal>
              </BentoCell>
            ))}
          </BentoGrid>
        </section>

        {/* ---------------------------------------------- TOURNAMENT FIT FINDER */}
        <section id="tournament-fit" className="premium-glass border-x-0">
          <div className="mx-auto max-w-content container-px py-20">
            <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <Reveal>
                <span className="font-premium text-xs font-semibold uppercase tracking-[0.2em] text-stone">
                  New — Tournament fit finder
                </span>
                <h2 className="mt-4 text-balance font-premium text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
                  Know if a tournament is{" "}
                  <span className="premium-gradient-text">worth it</span> before you
                  enter.
                </h2>
                <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-stone">
                  Seeded scores the draw against your level, cost per match, and
                  travel — then calls it: good, decent, or bad fit.
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-stone">
                  {[
                    "Every USTA level, L1–L7, plus UTR events",
                    "Flags fields too weak or too strong to move your rating",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-accent" />
                      {line}
                    </li>
                  ))}
                </ul>
                <Magnetic strength={0.3} className="mt-8">
                  <Link
                    href="/tournament-fit"
                    className="group flex w-fit items-center gap-2 rounded-pill px-6 py-3.5 font-premium text-sm font-semibold text-on-primary shadow-premium-2"
                    style={{ background: "var(--p-accent-gradient)" }}
                  >
                    Open the fit finder
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Magnetic>
              </Reveal>

              <Reveal index={1} step={0.1}>
                <FitFinderTeaser />
              </Reveal>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- PROGRAM UNIVERSE */}
        <section className="py-16">
          <Reveal className="mx-auto mb-8 flex max-w-content flex-col justify-between gap-4 container-px sm:flex-row sm:items-end">
            <div>
              <span className="font-premium text-xs font-semibold uppercase tracking-[0.2em] text-stone">
                Program universe
              </span>
              <h2 className="mt-3 font-premium text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
                Compare programs like these.
              </h2>
            </div>
            <Link
              href="/schools"
              className="inline-flex items-center gap-1 font-premium text-sm font-medium text-grass"
            >
              Open the rankings
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <SchoolMarquee schools={marqueeSchools} />
        </section>

        {/* ---------------------------------------------- METHODOLOGY */}
        <section className="premium-glass border-x-0">
          <div className="mx-auto grid max-w-content gap-12 container-px py-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <Reveal>
                <span className="font-premium text-xs font-semibold uppercase tracking-[0.2em] text-stone">
                  Our methodology
                </span>
                <h2 className="mt-4 font-premium text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
                  Grounded projections, never recruiting fantasy.
                </h2>
              </Reveal>
              <div className="mt-7 space-y-6">
                {METHODOLOGY.map(([title, body], i) => (
                  <Reveal key={title} index={i + 1} step={0.08} className="flex gap-5">
                    <span className="premium-gradient-text font-mono text-3xl leading-none sm:text-4xl">
                      {`0${i + 1}`}
                    </span>
                    <div>
                      <p className="font-premium font-medium text-ink">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-stone">{body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            <Reveal index={1} step={0.1}>
              <RecruitingFitPanel />
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------- CINEMATIC BAND */}
        <CinematicBand
          image="/images/band-court.jpg"
          eyebrow="Earn your place"
          title="Recruiting should feel like a privilege, not a guess."
          body="Seeded is built for players serious about the climb — every projection grounded, every step deliberate, every decision yours to own."
        />

        {/* -------------------------------------------------------- HOW IT WORKS (bento) */}
        <section id="how-it-works" className="mx-auto max-w-content container-px py-24">
          <Reveal className="max-w-2xl">
            <span className="font-premium text-xs font-semibold uppercase tracking-[0.2em] text-stone">
              How it works
            </span>
            <h2 className="mt-4 font-premium text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              One guided loop, assessment to outreach.
            </h2>
          </Reveal>
          <BentoGrid className="mt-10">
            {LOOP.map(([title, body], i) => (
              <BentoCell key={title} span={6}>
                <Reveal index={i} step={0.06} className="h-full">
                  <SpotlightCard className="premium-glass flex h-full flex-col rounded-[26px] p-8 shadow-premium-1">
                    <span className="premium-gradient-text font-mono text-4xl leading-none transition-transform duration-300 group-hover:-translate-y-1">
                      {`0${i + 1}`}
                    </span>
                    <h3 className="mt-6 font-premium text-xl font-medium text-ink">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-stone">{body}</p>
                  </SpotlightCard>
                </Reveal>
              </BentoCell>
            ))}
          </BentoGrid>
        </section>

        {/* -------------------------------------------------------- CTA */}
        <section className="relative overflow-hidden py-24 text-center">
          <GradientMeshBg className="opacity-60" />
          <Reveal className="relative mx-auto max-w-2xl container-px">
            <span className="font-premium text-xs font-semibold uppercase tracking-[0.2em] text-stone">
              Begin
            </span>
            <h2 className="mt-4 text-balance font-premium text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Start with an honest fit check.
            </h2>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Magnetic strength={0.3}>
                <Link
                  href="/signup"
                  className="flex items-center justify-center gap-2 rounded-pill px-6 py-3.5 font-premium text-sm font-semibold text-on-primary shadow-premium-2"
                  style={{ background: "var(--p-accent-gradient)" }}
                >
                  Create your profile
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Magnetic>
              <Link
                href="/schools"
                className="premium-glass flex items-center justify-center rounded-pill px-6 py-3.5 font-premium text-sm font-semibold text-ink"
              >
                Browse the database
              </Link>
            </div>
          </Reveal>
        </section>
      </div>
      <Footer />
    </>
  );
}
