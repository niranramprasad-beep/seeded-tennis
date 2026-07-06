import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Compass,
  Mail,
  Route,
  School,
  ShieldCheck,
} from "lucide-react";
import { getSchools, getTestimonials } from "@/lib/data";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/shared/fade-in";
import { SchoolMarquee } from "@/components/home/school-marquee";
import { CinematicBand } from "@/components/home/cinematic-band";
import { FitFinderTeaser } from "@/components/home/fit-finder-teaser";
import { Footer } from "@/components/layout/footer";

const CAPABILITIES = [
  {
    icon: School,
    title: "School matching",
    body: "Compare programs by roster UTR, minimum competitive UTR, academics, and division — men's and women's.",
  },
  {
    icon: Route,
    title: "Year-by-year roadmap",
    body: "UTR targets framed by the summer before each grade, so the timeline is honest, not aspirational.",
  },
  {
    icon: Compass,
    title: "Tournament fit finder",
    body: "Know if an event is worth entering before you pay — draw strength, cost per match, and travel, scored.",
  },
  {
    icon: Mail,
    title: "Coach outreach",
    body: "Compose specific, credible emails from your real results and track every program conversation.",
  },
];

const METHODOLOGY: [string, string][] = [
  ["Roster reality", "Average roster UTR, minimum competitive UTR, and division-specific bands for men's and women's programs."],
  ["Academic context", "GPA, graduation year, and US News standing — fit signals a parent can read at a glance."],
  ["Timeline pressure", "Summer-before-grade checkpoints and tournament volume, shown as confidence bands, never guarantees."],
];

const LOOP: [string, string][] = [
  ["Assess", "UTR, grade, grad year, and target division."],
  ["Match", "Rank programs by tennis and academic fit."],
  ["Train", "Build the week around the actual gap."],
  ["Track", "Log check-ins, matches, and coach replies."],
];

export default async function HomePage() {
  const [schools, testimonials] = await Promise.all([getSchools(), getTestimonials()]);
  const marqueeSchools = schools.slice(0, 18);

  return (
    <>
      <div className="bg-cream text-ink">
        {/* ----------------------------------------------------------- HERO */}
        <section className="relative overflow-hidden border-b-hairline border-line bg-[#FBFAF3]">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(151,196,89,0.12),transparent_70%)]"
          />
          <div className="relative mx-auto grid max-w-content items-center gap-14 container-px pb-20 pt-32 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-36">
            <FadeIn>
              <span className="eyebrow text-grass">College tennis recruiting</span>
              <h1 className="display-serif mt-6 text-balance text-5xl leading-[1.04] text-ink sm:text-6xl lg:text-7xl">
                Find where you{" "}
                <span className="italic text-grass">realistically</span> fit in
                college tennis.
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-stone">
                Seeded turns your UTR, academics, and target division into an
                honest, roster-matched recruiting plan — the kind serious tennis
                families make real decisions on.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className={cn(buttonVariants({ variant: "primary", size: "lg" }), "group")}
                >
                  Build my fit report
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/schools"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "group bg-white/70"
                  )}
                >
                  Browse schools free
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>

              <div className="mt-12 grid max-w-lg grid-cols-3 divide-x divide-line border-t-hairline border-line pt-6">
                {[
                  ["67", "programs ranked"],
                  ["D1–D3", "men's & women's"],
                  ["1–16.5", "full UTR scale"],
                ].map(([value, label]) => (
                  <div key={label} className="px-4 first:pl-0">
                    <p className="font-serif text-3xl text-grass">{value}</p>
                    <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={0.12}>
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="overflow-hidden rounded-[32px] border-hairline border-line shadow-lift">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/hero-match.jpg"
                    alt="Junior tennis player mid-match"
                    className="aspect-[4/5] w-full object-cover"
                  />
                </div>
                {/* floating proof chips */}
                <div className="absolute -left-4 bottom-8 rounded-2xl border-hairline border-line bg-card/95 px-4 py-3 shadow-lift backdrop-blur sm:-left-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-light">
                    Roadmap
                  </p>
                  <p className="mt-0.5 font-serif text-xl text-ink">
                    UTR 8.2 <span className="text-grass">→ 10.5</span>
                  </p>
                  <p className="text-xs text-stone">by summer before senior year</p>
                </div>
                <div className="absolute -right-3 top-8 flex items-center gap-2 rounded-pill border-hairline border-line bg-card/95 px-4 py-2.5 shadow-lift backdrop-blur sm:-right-6">
                  <span className="h-2 w-2 rounded-full bg-grass" />
                  <p className="text-sm font-medium text-ink">
                    Tournament: <span className="text-grass">good fit</span>
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* -------------------------------------------------------- TRUST STRIP */}
        <section className="border-b-hairline border-line bg-card">
          <div className="mx-auto flex max-w-content flex-col gap-3 container-px py-5 text-sm text-stone sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-grass" />
              School & roster data reviewed recently
            </p>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-grass" />
              Projections shown as confidence bands, never guarantees
            </p>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <p className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-grass" />
              Built on the full 1–16.5 UTR scale
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- CAPABILITIES */}
        <section className="mx-auto max-w-content container-px py-24">
          <FadeIn className="max-w-2xl">
            <span className="eyebrow text-grass">What you get</span>
            <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl">
              Everything recruiting asks of you, in one place.
            </h2>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-stone">
              Organized around the questions tennis families actually ask: where
              can I play, what needs to change, and how do we reach coaches well.
            </p>
          </FadeIn>

          <div className="mt-14 grid gap-px overflow-hidden rounded-card border-hairline border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((item, i) => (
              <FadeIn key={item.title} delay={i * 0.06}>
                <div className="h-full bg-card p-7">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border-hairline border-grass/20 bg-grass-50 text-grass">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-medium text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone">{item.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------- TOURNAMENT FIT FINDER */}
        <section id="tournament-fit" className="border-y-hairline border-line bg-card">
          <div className="mx-auto max-w-content container-px py-24">
            <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <FadeIn>
                <span className="eyebrow text-grass">New — Tournament fit finder</span>
                <h2 className="display-serif mt-4 text-balance text-4xl text-ink sm:text-5xl">
                  Know if a tournament is{" "}
                  <span className="serif-accent text-grass">worth it</span> before
                  you enter.
                </h2>
                <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-stone">
                  UTR moves on results against opponents near your rating.
                  Seeded scores the draw against your level, the cost per match,
                  and the drive — then calls it: good fit, decent fit, or bad fit.
                </p>
                <ul className="mt-7 space-y-3 text-sm text-stone">
                  {[
                    "Works for every USTA level, L1 through L7, plus UTR events",
                    "Flags fields too weak (or too strong) to move your rating",
                    "Compares cost per meaningful match, not just the entry fee",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-accent" />
                      {line}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/tournament-fit"
                  className={cn(buttonVariants({ variant: "primary", size: "lg" }), "group mt-8")}
                >
                  Open the fit finder
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </FadeIn>

              <FadeIn delay={0.1}>
                <FitFinderTeaser />
              </FadeIn>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- PROGRAM UNIVERSE */}
        <section className="border-b-hairline border-line py-20">
          <div className="mx-auto mb-8 flex max-w-content flex-col justify-between gap-4 container-px sm:flex-row sm:items-end">
            <div>
              <span className="eyebrow text-grass">Program universe</span>
              <h2 className="display-serif mt-3 text-3xl text-ink sm:text-4xl">
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
          </div>
          <SchoolMarquee schools={marqueeSchools} />
        </section>

        {/* ---------------------------------------------- METHODOLOGY */}
        <section className="border-b-hairline border-line bg-card">
          <div className="mx-auto grid max-w-content gap-12 container-px py-24 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <FadeIn>
              <span className="eyebrow text-grass">Our methodology</span>
              <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl">
                Grounded projections, never recruiting fantasy.
              </h2>
              <p className="mt-5 max-w-md text-pretty leading-relaxed text-stone">
                Every fit estimate is built from realistic program benchmarks and
                honest timelines, so the plan holds up to a coach's scrutiny.
              </p>
              <div className="rule-green mt-8 max-w-xs" />
              <div className="mt-8 space-y-6">
                {METHODOLOGY.map(([title, body], i) => (
                  <div key={title} className="flex gap-4">
                    <span className="font-serif text-2xl italic text-grass">{`0${i + 1}`}</span>
                    <div>
                      <p className="font-medium text-ink">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-stone">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            {/* sample recruiting board */}
            <FadeIn delay={0.1}>
              <div className="overflow-hidden rounded-card border-hairline border-line bg-white">
                <div className="flex items-center justify-between border-b-hairline border-line px-5 py-4">
                  <p className="text-sm font-medium text-ink">Recruiting board</p>
                  <span className="eyebrow text-stone-light">sample</span>
                </div>
                <div className="divide-y divide-line">
                  {[
                    ["Cornell", "Ivy League", "11.8", "Developing"],
                    ["Duke", "ACC", "13.3", "Reach"],
                    ["Northwestern", "Big Ten", "12.3", "Match / reach"],
                    ["Emory", "UAA · D3", "11.5", "Strong fit"],
                  ].map(([name, conf, utr, status]) => (
                    <div
                      key={name}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3.5 sm:grid-cols-[1fr_72px_120px]"
                    >
                      <div>
                        <p className="font-medium text-ink">{name}</p>
                        <p className="text-xs text-stone-light">{conf}</p>
                      </div>
                      <p className="hidden text-sm text-stone sm:block">{utr} avg</p>
                      <span className="justify-self-end rounded-pill border-hairline border-grass/20 bg-grass-50 px-3 py-1 text-xs font-medium text-grass">
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
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
        <section id="how-it-works" className="mx-auto max-w-content container-px py-24">
          <FadeIn className="max-w-2xl">
            <span className="eyebrow text-grass">How it works</span>
            <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl">
              One guided loop, assessment to outreach.
            </h2>
          </FadeIn>
          <div className="mt-14 grid gap-px overflow-hidden rounded-card border-hairline border-line bg-line md:grid-cols-2 lg:grid-cols-4">
            {LOOP.map(([title, body], i) => (
              <FadeIn key={title} delay={i * 0.06}>
                <div className="flex h-full flex-col bg-card p-7">
                  <span className="font-serif text-3xl italic text-grass">{`0${i + 1}`}</span>
                  <h3 className="mt-6 text-xl font-medium text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone">{body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- TESTIMONIALS */}
        <section id="testimonials" className="border-t-hairline border-line bg-card py-24">
          <div className="mx-auto max-w-content container-px">
            <FadeIn className="max-w-2xl">
              <span className="eyebrow text-grass">Parent confidence</span>
              <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl">
                Trusted with real recruiting decisions.
              </h2>
            </FadeIn>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {testimonials.slice(0, 3).map((item, i) => (
                <FadeIn key={item.id} delay={i * 0.06}>
                  <Card className="flex h-full flex-col p-7">
                    <span className="font-serif text-5xl leading-none text-grass/50">
                      &ldquo;
                    </span>
                    <p className="mt-3 flex-1 text-pretty leading-relaxed text-ink">
                      {item.quote}
                    </p>
                    <div className="mt-6 border-t-hairline border-line pt-4">
                      <p className="font-medium text-ink">{item.parentName}</p>
                      <p className="mt-0.5 text-xs text-stone-light">
                        {item.relationship} · {item.location}
                      </p>
                    </div>
                  </Card>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- CTA */}
        <section className="mx-auto max-w-content container-px py-24 text-center">
          <FadeIn className="mx-auto max-w-2xl">
            <span className="eyebrow text-grass">Begin</span>
            <h2 className="display-serif mt-4 text-balance text-4xl text-ink sm:text-5xl">
              Start with an honest fit check.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-pretty text-lg leading-relaxed text-stone">
              Build your player profile, compare programs, and turn recruiting
              into a clear weekly plan.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className={buttonVariants({ variant: "primary", size: "lg" })}
              >
                Create your profile
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/schools"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Browse the database
              </Link>
            </div>
          </FadeIn>
        </section>
      </div>
      <Footer />
    </>
  );
}
