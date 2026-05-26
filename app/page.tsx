import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Clock3,
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
import { RecruitingFitPanel } from "@/components/home/recruiting-fit-panel";
import { TennisBalls } from "@/components/home/tennis-balls";
import { CinematicBand } from "@/components/home/cinematic-band";
import { Footer } from "@/components/layout/footer";

const MOMENTS: { img: string; title: string; body: string }[] = [
  { img: "/images/hero-match.jpg", title: "Match play", body: "Results that move your UTR" },
  { img: "/images/hero-court.jpg", title: "On the court", body: "Training that targets the gap" },
  { img: "/images/hero-craft.jpg", title: "The craft", body: "Details that earn a roster spot" },
];

const CAPABILITIES = [
  {
    icon: School,
    title: "Roster fit engine",
    body: "Measure your level against the roster bands coaches genuinely recruit into — by division and gender.",
  },
  {
    icon: Route,
    title: "Year-by-year roadmap",
    body: "UTR targets framed by the summer before each grade, so the timeline is honest, not aspirational.",
  },
  {
    icon: Mail,
    title: "Coach outreach",
    body: "Compose specific, credible emails and track every program conversation in one place.",
  },
  {
    icon: BarChart3,
    title: "Training & match signal",
    body: "Turn sessions, check-ins, and match logs into a recruiting trajectory you can actually follow.",
  },
];

const METHODOLOGY: [string, string][] = [
  ["Roster reality", "Average roster UTR, minimum competitive UTR, and division-specific bands for men's and women's programs."],
  ["Academic context", "GPA, graduation year, and US News standing — fit signals a parent can read at a glance."],
  ["Timeline pressure", "Summer-before-grade checkpoints and tournament volume, shown as confidence bands, never guarantees."],
];

const LOOP: [string, string][] = [
  ["Assess", "UTR, GPA, grad year, and target division."],
  ["Match", "Rank programs by tennis and academic fit."],
  ["Train", "Build the week around the actual gap."],
  ["Track", "Log check-ins, matches, and coach replies."],
];

const PATH_NOTES: [string, string, string][] = [
  ["01", "Tournament signal", "Which events actually move the profile, and when the calendar needs more volume."],
  ["02", "Roster window", "The exact range where your UTR and academics make a coach conversation realistic."],
  ["03", "Weekly edge", "Training hours, recovery, and match prep shaped around the gap to your next target."],
];

export default async function HomePage() {
  const [schools, testimonials] = await Promise.all([getSchools(), getTestimonials()]);
  const marqueeSchools = schools.slice(0, 18);

  return (
    <>
      <main className="bg-cream text-ink">
        {/* ----------------------------------------------------------- HERO */}
        <section className="relative min-h-screen overflow-hidden bg-grass-900 text-cream">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/hero-celebration.jpg"
            alt="Tennis player celebrating after a match"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-grass-900/88 via-grass-900/54 to-grass-900/18" />
          <div className="absolute inset-0 bg-gradient-to-t from-grass-900/78 via-transparent to-grass-900/40" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_28%,rgba(216,232,74,0.22),transparent_24%),radial-gradient(circle_at_22%_78%,rgba(253,252,247,0.14),transparent_28%)]" />
          <TennisBalls />
          <div className="relative z-10 mx-auto grid min-h-screen max-w-content gap-14 container-px pb-20 pt-32 lg:grid-cols-[1.05fr_440px] lg:items-center lg:pb-24 lg:pt-32">
            <FadeIn className="flex flex-col">
              <span className="eyebrow text-gold">College tennis recruiting</span>
              <h1 className="display-serif mt-6 text-balance text-5xl leading-[1.02] text-cream drop-shadow-[0_12px_34px_rgba(0,0,0,0.34)] sm:text-6xl lg:text-7xl">
                Find where you{" "}
                <span className="italic text-tennis">realistically</span> fit in
                college tennis.
              </h1>
              <p className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-cream/80">
                Seeded turns your UTR, academics, and target division into an
                honest, roster-matched recruiting plan — the kind serious tennis
                families make real decisions on.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className={cn(
                    buttonVariants({ variant: "primary", size: "lg" }),
                    "group bg-cream text-grass hover:bg-tennis hover:text-grass-900 hover:shadow-[0_0_48px_rgba(216,232,74,0.32)]"
                  )}
                >
                  Build my fit report
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/schools"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "group border-cream/40 bg-cream/8 text-cream backdrop-blur hover:border-tennis hover:bg-cream/14 hover:text-cream hover:shadow-[0_0_38px_rgba(216,232,74,0.2)]"
                  )}
                >
                  Browse schools free
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>

              <div className="mt-12 grid max-w-lg grid-cols-3 divide-x divide-cream/20 border-t-hairline border-cream/20 pt-6">
                {[
                  ["1,200+", "programs tracked"],
                  ["D1–D3", "men's & women's"],
                  ["Summer", "grade checkpoints"],
                ].map(([value, label]) => (
                  <div key={label} className="px-4 first:pl-0">
                    <p className="font-serif text-3xl text-tennis">{value}</p>
                    <p className="eyebrow mt-2 text-cream/58">{label}</p>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={0.12}>
              <RecruitingFitPanel />
            </FadeIn>
          </div>
        </section>

        {/* -------------------------------------------------------- MOMENTS */}
        <section className="mx-auto max-w-content container-px py-14">
          <div className="grid gap-4 sm:grid-cols-3">
            {MOMENTS.map((m, i) => (
              <FadeIn key={m.title} delay={i * 0.08}>
                <div className="group relative aspect-[4/3] overflow-hidden rounded-card border-hairline border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.img}
                    alt={m.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-grass-900/85 via-grass-900/10 to-transparent" />
                  <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-tennis shadow-soft transition-transform duration-500 group-hover:scale-125" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="font-serif text-xl text-cream">{m.title}</p>
                    <p className="mt-0.5 text-sm text-cream/75">{m.body}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- TENNIS WORLD */}
        <section className="mx-auto max-w-content container-px pb-24">
          <div className="grid gap-8 rounded-[34px] border-hairline border-line bg-card p-4 shadow-soft lg:grid-cols-[0.95fr_1.05fr] lg:p-6">
            <FadeIn className="relative min-h-[420px] overflow-hidden rounded-[28px] bg-grass-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/hero-court.jpg"
                alt="Tennis court at golden hour"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-grass-900/88 via-grass-900/20 to-transparent" />
              <div className="absolute left-5 top-5 rounded-full border-hairline border-cream/20 bg-cream/10 px-4 py-2 text-xs font-medium text-cream backdrop-blur">
                Recruiting fit, live
              </div>
              <div className="absolute inset-x-0 bottom-0 p-6 text-cream sm:p-8">
                <p className="font-serif text-4xl italic">Bethesda to campus</p>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-cream/75">
                  A calmer way to read the season: courts, results, school fit,
                  and outreach moving together instead of scattered tabs.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.08} className="flex flex-col justify-center p-2 sm:p-6">
              <span className="eyebrow text-gold">The recruiting landscape</span>
              <h2 className="display-serif mt-4 text-balance text-4xl text-ink sm:text-5xl">
                Scroll through the season with a plan that feels alive.
              </h2>
              <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-stone">
                Seeded connects the parts families usually manage separately:
                UTR movement, tournament choices, college lists, training load,
                and coach communication.
              </p>
              <div className="mt-8 divide-y divide-line">
                {PATH_NOTES.map(([number, title, body]) => (
                  <div key={title} className="grid grid-cols-[44px_1fr] gap-4 py-5">
                    <span className="font-serif text-2xl italic text-gold">{number}</span>
                    <div>
                      <p className="font-medium text-ink">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-stone">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* -------------------------------------------------------- TRUST STRIP */}
        <section className="border-b-hairline border-line bg-card">
          <div className="mx-auto flex max-w-content flex-col gap-3 container-px py-5 text-sm text-stone sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-gold" />
              School & roster data reviewed recently
            </p>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-gold" />
              Projections shown as confidence bands, never guarantees
            </p>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <p className="flex items-center gap-2">
              <School className="h-4 w-4 text-gold" />
              Built by competitive juniors and recruiting families
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- CAPABILITIES */}
        <section className="mx-auto max-w-content container-px py-24">
          <FadeIn className="max-w-2xl">
            <span className="eyebrow text-gold">What you get</span>
            <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl">
              A recruiting workflow that feels considered.
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
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border-hairline border-gold/30 bg-gold/10 text-gold">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-medium text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone">
                    {item.body}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------- METHODOLOGY (dark band) */}
        <section className="bg-grass-900 text-cream">
          <div className="mx-auto grid max-w-content gap-12 container-px py-24 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <FadeIn>
              <span className="eyebrow text-gold">Our methodology</span>
              <h2 className="display-serif mt-4 text-4xl text-cream sm:text-5xl">
                Grounded projections, never recruiting fantasy.
              </h2>
              <p className="mt-5 max-w-md text-pretty leading-relaxed text-cream/70">
                Every fit estimate is built from real program data and honest
                timelines, so the plan holds up to a coach's scrutiny.
              </p>
              <div className="rule-gold mt-8 max-w-xs" />
              <div className="mt-8 space-y-6">
                {METHODOLOGY.map(([title, body], i) => (
                  <div key={title} className="flex gap-4">
                    <span className="font-serif text-2xl italic text-gold">
                      {`0${i + 1}`}
                    </span>
                    <div>
                      <p className="font-medium text-cream">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-cream/65">
                        {body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            {/* sample recruiting board */}
            <FadeIn delay={0.1}>
              <div className="overflow-hidden rounded-card border-hairline border-cream/15 bg-cream/[0.04]">
                <div className="flex items-center justify-between border-b-hairline border-cream/15 px-5 py-4">
                  <p className="text-sm font-medium text-cream/80">Recruiting board</p>
                  <span className="eyebrow text-cream/40">sample</span>
                </div>
                <div className="divide-y divide-cream/10">
                  {[
                    ["Cornell", "Ivy League", "10.0", "Developing"],
                    ["Duke", "ACC", "11.5", "Reach"],
                    ["Northwestern", "Big Ten", "10.5", "Match / reach"],
                    ["Emory", "UAA · D3", "10.5", "Strong fit"],
                  ].map(([name, conf, utr, status]) => (
                    <div
                      key={name}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3.5 sm:grid-cols-[1fr_72px_120px]"
                    >
                      <div>
                        <p className="font-medium text-cream">{name}</p>
                        <p className="text-xs text-cream/45">{conf}</p>
                      </div>
                      <p className="hidden text-sm text-cream/60 sm:block">
                        {utr} avg
                      </p>
                      <span className="justify-self-end rounded-pill border-hairline border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* -------------------------------------------------------- PROGRAM UNIVERSE */}
        <section className="border-b-hairline border-line py-20">
          <div className="mx-auto mb-8 flex max-w-content flex-col justify-between gap-4 container-px sm:flex-row sm:items-end">
            <div>
              <span className="eyebrow text-gold">Program universe</span>
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

        {/* ----------------------------------------------------- CINEMATIC BAND */}
        <CinematicBand
          image="/images/band-court.jpg"
          eyebrow="Earn your place"
          title="Recruiting should feel like a privilege, not a guess."
          body="Seeded is built for players serious about the climb — every projection grounded, every step deliberate, every decision yours to own."
        />

        {/* -------------------------------------------------------- THE LOOP */}
        <section className="mx-auto max-w-content container-px py-24">
          <FadeIn className="max-w-2xl">
            <span className="eyebrow text-gold">How it works</span>
            <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl">
              One guided loop, assessment to outreach.
            </h2>
          </FadeIn>
          <div className="mt-14 grid gap-px overflow-hidden rounded-card border-hairline border-line bg-line md:grid-cols-2 lg:grid-cols-4">
            {LOOP.map(([title, body], i) => (
              <FadeIn key={title} delay={i * 0.06}>
                <div className="flex h-full flex-col bg-card p-7">
                  <span className="font-serif text-3xl italic text-gold">
                    {`0${i + 1}`}
                  </span>
                  <h3 className="mt-6 text-xl font-medium text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone">{body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- TESTIMONIALS */}
        <section className="border-t-hairline border-line bg-card py-24">
          <div className="mx-auto max-w-content container-px">
            <FadeIn className="max-w-2xl">
              <span className="eyebrow text-gold">Parent confidence</span>
              <h2 className="display-serif mt-4 text-4xl text-ink sm:text-5xl">
                Trusted with real recruiting decisions.
              </h2>
            </FadeIn>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {testimonials.slice(0, 3).map((item, i) => (
                <FadeIn key={item.id} delay={i * 0.06}>
                  <Card className="flex h-full flex-col p-7">
                    <span className="font-serif text-5xl leading-none text-gold/50">
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
            <span className="eyebrow text-gold">Begin</span>
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
      </main>
      <Footer />
    </>
  );
}
