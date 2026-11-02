import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import type { SchoolLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";
import { CourtRule } from "@/components/shared/court-rule";
import { SpotlightCard } from "@/components/shared/spotlight-card";
import { GlowOrb } from "@/components/shared/glow-orb";
import { Magnetic } from "@/components/shared/magnetic";
import { Parallax } from "@/components/shared/parallax";
import { CountUpOnView } from "@/components/shared/count-up-on-view";
import { SchoolMarquee } from "@/components/home/school-marquee";
import { CinematicBand } from "@/components/home/cinematic-band";
import { FitFinderTeaser } from "@/components/home/fit-finder-teaser";
import { RecruitingFitPanel } from "@/components/home/recruiting-fit-panel";
import { Footer } from "@/components/layout/footer";
import { CAPABILITIES, METHODOLOGY, LOOP } from "./home-content";

// Extracted verbatim out of app/page.tsx so Seeded (components/seeded/
// home/seeded-home-view.tsx) can get a genuinely different composition
// without touching this one — zero JSX changes from the original page.
export function LegacyHomeView({ marqueeSchools }: { marqueeSchools: SchoolLite[] }) {
  return (
    <>
      <div className="bg-cream text-ink">
        {/* ----------------------------------------------------------- HERO */}
        <section className="relative overflow-hidden border-b-hairline border-line bg-cream">
          <div className="absolute inset-0 bg-grid-dots" />
          <GlowOrb className="-left-32 -top-40 h-[480px] w-[480px] opacity-70" />
          <GlowOrb className="-right-48 top-20 h-[360px] w-[360px] opacity-40" />
          <div className="relative mx-auto grid max-w-content items-center gap-14 container-px pb-16 pt-28 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20 lg:pt-32">
            <div>
              <Reveal index={0} step={0.09}>
                <span className="eyebrow text-grass">College tennis recruiting</span>
                <CourtRule className="mt-4 max-w-[140px] text-grass/70" />
              </Reveal>
              <Reveal index={1} step={0.09}>
                <h1 className="mt-6 text-balance text-5xl font-semibold leading-[0.96] tracking-tight text-ink sm:text-6xl lg:text-7xl">
                  Find where you{" "}
                  <span className="serif-accent text-grass">realistically</span>{" "}
                  fit in college tennis.
                </h1>
              </Reveal>
              <Reveal index={2} step={0.09}>
                <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-stone">
                  Your UTR, academics, and target division — turned into an
                  honest, roster-matched recruiting plan.
                </p>
              </Reveal>
              <Reveal index={3} step={0.09}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Magnetic strength={0.25}>
                    <Link
                      href="/signup"
                      className={cn(buttonVariants({ variant: "primary", size: "lg" }), "group")}
                    >
                      Build my fit report
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                  </Magnetic>
                  <Link
                    href="/schools"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "group bg-card/70"
                    )}
                  >
                    Browse schools free
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                </div>
              </Reveal>

              <Reveal index={4} step={0.09}>
                <div className="mt-12 max-w-lg border-t-hairline border-line pt-5">
                  <div className="grid grid-cols-3 divide-x divide-line">
                    <div className="px-1 first:pl-0 sm:px-4">
                      <p className="font-serif text-3xl text-grass sm:text-4xl">
                        <CountUpOnView value={67} className="font-serif text-3xl text-grass sm:text-4xl" />
                      </p>
                      <p className="mt-1.5 whitespace-nowrap text-[9px] font-semibold uppercase tracking-normal text-stone sm:text-xs sm:tracking-[0.14em]">
                        programs ranked
                      </p>
                    </div>
                    {[
                      ["D1–D3", "men's & women's"],
                      ["1–16.5", "full UTR scale"],
                    ].map(([value, label]) => (
                      <div key={label} className="px-1 sm:px-4">
                        <p className="stat-number font-serif text-3xl text-grass sm:text-4xl">
                          {value}
                        </p>
                        <p className="mt-1.5 whitespace-nowrap text-[9px] font-semibold uppercase tracking-normal text-stone sm:text-xs sm:tracking-[0.14em]">
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal index={2} step={0.12}>
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <Parallax offset={16}>
                  <div className="overflow-hidden rounded-[32px] border-hairline border-line shadow-lift">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/hero-celebration.jpg"
                      alt="Tennis player mid-match, full extension on a forehand"
                      className="aspect-[4/5] w-full object-cover"
                    />
                  </div>
                </Parallax>
                {/* floating proof chips */}
                <div
                  className="absolute -left-4 bottom-8 animate-float rounded-2xl border-hairline border-line bg-card px-4 py-3 shadow-lift sm:-left-8"
                  style={{ animationDelay: "0.4s" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-light">
                    Roadmap
                  </p>
                  <p className="stat-number mt-0.5 font-serif text-2xl text-ink">
                    UTR 8.2 <span className="text-grass">→ 10.5</span>
                  </p>
                  <p className="text-xs text-stone">by summer before senior year</p>
                </div>
                <div
                  className="absolute -right-3 top-8 flex animate-float items-center gap-2 rounded-pill border-hairline border-line bg-card px-4 py-2.5 shadow-lift sm:-right-6"
                >
                  <span className="h-2 w-2 rounded-full bg-grass" />
                  <p className="text-sm font-medium text-ink">
                    Tournament: <span className="text-grass">good fit</span>
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- TRUST STRIP */}
        <section className="border-b-hairline border-line bg-card">
          <div className="mx-auto flex max-w-content flex-col gap-3 container-px py-4 text-sm text-stone sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-grass" />
              Rosters reviewed recently
            </p>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-grass" />
              Confidence bands, never guarantees
            </p>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <p className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-grass" />
              Full 1–16.5 UTR scale
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- CAPABILITIES */}
        <section className="mx-auto max-w-content container-px py-20">
          <Reveal className="max-w-2xl">
            <span className="eyebrow text-grass">What you get</span>
            <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl lg:text-6xl">
              Everything recruiting asks of you.
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-px overflow-hidden rounded-card border-hairline border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((item, i) => (
              <Reveal key={item.title} index={i} step={0.06}>
                <SpotlightCard className="h-full bg-card p-7">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border-hairline border-grass/20 bg-grass-50 text-grass transition-colors duration-300 group-hover:bg-grass group-hover:text-on-primary">
                    <item.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                  </span>
                  <h3 className="mt-6 text-lg font-medium text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone">{item.body}</p>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------- TOURNAMENT FIT FINDER */}
        <section id="tournament-fit" className="border-y-hairline border-line bg-card">
          <div className="mx-auto max-w-content container-px py-20">
            <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <Reveal>
                <span className="eyebrow text-grass">New — Tournament fit finder</span>
                <h2 className="display-serif mt-4 text-balance text-4xl text-ink sm:text-5xl lg:text-6xl">
                  Know if a tournament is{" "}
                  <span className="serif-accent text-grass">worth it</span> before
                  you enter.
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
                <Magnetic strength={0.25} className="mt-8">
                  <Link
                    href="/tournament-fit"
                    className={cn(buttonVariants({ variant: "primary", size: "lg" }), "group")}
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
        <section className="border-b-hairline border-line py-16">
          <Reveal className="mx-auto mb-8 flex max-w-content flex-col justify-between gap-4 container-px sm:flex-row sm:items-end">
            <div>
              <span className="eyebrow text-grass">Program universe</span>
              <h2 className="display-serif mt-3 text-3xl text-ink sm:text-4xl lg:text-5xl">
                Compare programs like these.
              </h2>
            </div>
            <Link
              href="/schools"
              className="inline-flex items-center gap-1 text-sm font-medium text-grass transition-colors hover:text-grass-600"
            >
              Open the rankings
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <SchoolMarquee schools={marqueeSchools} />
        </section>

        {/* ---------------------------------------------- METHODOLOGY */}
        <section className="border-b-hairline border-line bg-card">
          <div className="mx-auto grid max-w-content gap-12 container-px py-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <Reveal>
                <span className="eyebrow text-grass">Our methodology</span>
                <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl lg:text-6xl">
                  Grounded projections, never recruiting fantasy.
                </h2>
                <div className="rule-green mt-7 max-w-xs" />
              </Reveal>
              <div className="mt-7 space-y-6">
                {METHODOLOGY.map(([title, body], i) => (
                  <Reveal key={title} index={i + 1} step={0.08} className="flex gap-5">
                    <span className="stat-number font-serif text-4xl italic leading-none text-grass sm:text-5xl">
                      {`0${i + 1}`}
                    </span>
                    <div>
                      <p className="font-medium text-ink">{title}</p>
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

        {/* -------------------------------------------------------- HOW IT WORKS */}
        <section id="how-it-works" className="mx-auto max-w-content container-px py-20">
          <Reveal className="max-w-2xl">
            <span className="eyebrow text-grass">How it works</span>
            <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl lg:text-6xl">
              One guided loop, assessment to outreach.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-px overflow-hidden rounded-card border-hairline border-line bg-line md:grid-cols-2 lg:grid-cols-4">
            {LOOP.map(([title, body], i) => (
              <Reveal key={title} index={i} step={0.06}>
                <SpotlightCard className="flex h-full flex-col bg-card p-7">
                  <span className="stat-number font-serif text-4xl italic leading-none text-grass transition-transform duration-300 group-hover:-translate-y-1">
                    {`0${i + 1}`}
                  </span>
                  <h3 className="mt-6 text-xl font-medium text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone">{body}</p>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- CTA */}
        <section className="mx-auto max-w-content container-px py-20 text-center">
          <Reveal className="mx-auto max-w-2xl">
            <span className="eyebrow text-grass">Begin</span>
            <h2 className="display-serif mt-4 text-balance text-4xl text-ink sm:text-5xl lg:text-6xl">
              Start with an honest fit check.
            </h2>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Magnetic strength={0.25}>
                <Link
                  href="/signup"
                  className={buttonVariants({ variant: "primary", size: "lg" })}
                >
                  Create your profile
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Magnetic>
              <Link
                href="/schools"
                className={buttonVariants({ variant: "outline", size: "lg" })}
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
