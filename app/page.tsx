import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Map,
  CalendarDays,
  Mail,
  Quote,
  Route,
  School,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { getSchools, getTestimonials } from "@/lib/data";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/shared/fade-in";
import { FloatingDots } from "@/components/shared/floating-dots";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { SchoolMarquee } from "@/components/home/school-marquee";
import { Footer } from "@/components/layout/footer";

const HOW_IT_WORKS = [
  {
    numeral: "i",
    title: "Tell us where you stand",
    body: "Your UTR, your grade, the schools you dream about, and the parts of your game you want to grow. Two minutes, no pressure.",
  },
  {
    numeral: "ii",
    title: "Get your honest roadmap",
    body: "A year-by-year plan with realistic UTR targets and the exact tournaments that move the needle for your level.",
  },
  {
    numeral: "iii",
    title: "Reach out with confidence",
    body: "Personalized coach emails, a structured training week, and progress tracking the whole family can follow.",
  },
];

const FEATURES = [
  {
    icon: Map,
    badge: "Roadmap",
    title: "A path mapped match by match",
    body: "See exactly which UTR to target each year and how many tournaments it takes to get there. No guesswork, no fantasy reaches.",
  },
  {
    icon: CalendarDays,
    badge: "Training",
    title: "A week built around your game",
    body: "Court, gym, match play, and recovery — balanced for your level, with a plan-health indicator that keeps you honest.",
  },
  {
    icon: Mail,
    badge: "Coach outreach",
    title: "Emails coaches actually read",
    body: "Generate personalized introductions from your real stats, track who you've contacted, and never stare at a blank page again.",
  },
];

const PRODUCT_STEPS = [
  {
    icon: Route,
    id: "roadmap-preview",
    eyebrow: "Roadmap",
    title: "See the UTR target before the pressure hits.",
    body: "Targets are framed by the summer before each grade year, with tournament volume and school fit shown in one clean recruiting timeline.",
  },
  {
    icon: School,
    id: "school-matching",
    eyebrow: "School matching",
    title: "Rank programs by tennis level and academics.",
    body: "Compare men's and women's programs across D1, D2 and D3 with roster UTR, minimum competitive UTR, conference, and academic ranking.",
  },
  {
    icon: ClipboardList,
    id: "training-preview",
    eyebrow: "Training planning",
    title: "Turn the roadmap into the actual week.",
    body: "Build sessions, save custom training types, organize full plans, and keep match play, strength, recovery and school life in balance.",
  },
];

export default async function HomePage() {
  const [schools, testimonials] = await Promise.all([
    getSchools(),
    getTestimonials(),
  ]);

  const marqueeSchools = schools.slice(0, 16);

  return (
    <>
      {/* ---------------------------------------------------------- HERO */}
      <section className="relative overflow-hidden">
        <FloatingDots />
        <div className="relative mx-auto max-w-content container-px pb-16 pt-20 sm:pt-28">
          <FadeIn className="mx-auto max-w-3xl text-center">
            <Badge variant="leaf" size="md" className="mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              For junior players UTR 5–12
            </Badge>
            <h1 className="text-balance text-4xl font-light leading-[1.08] tracking-tight text-ink sm:text-6xl">
              Your path to{" "}
              <span className="serif-accent text-grass">college tennis</span>,
              mapped match by match.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-stone">
              Seeded turns the chaos of recruiting into one clear plan — honest
              target schools, year-by-year UTR goals, and the outreach to get
              you there.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className={buttonVariants({ variant: "primary", size: "lg" })}
              >
                Build my roadmap
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/#how-it-works"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                See how it works
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={0.18} className="mx-auto mt-12 max-w-5xl">
            <div className="relative overflow-hidden rounded-[28px] border-[0.5px] border-line bg-card p-3 shadow-lift">
              <div className="grid gap-3 rounded-[22px] bg-cream/70 p-3 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[20px] bg-grass p-6 text-cream">
                  <div className="flex items-center justify-between">
                    <p className="font-serif text-lg italic text-leaf-accent">
                      Recruiting roadmap
                    </p>
                    <Badge variant="lime" size="sm">live plan</Badge>
                  </div>
                  <h2 className="mt-7 max-w-md text-3xl font-light leading-tight">
                    7.5 → 10.2 UTR by summer before 12th grade.
                  </h2>
                  <div className="mt-8 grid grid-cols-4 items-end gap-3">
                    {[38, 52, 70, 90].map((height, i) => (
                      <div key={height} className="space-y-2">
                        <div
                          style={{ height }}
                          className="rounded-full bg-leaf-accent"
                        />
                        <p className="text-center text-[10px] text-cream/70">
                          {["now", "pre-11", "pre-12", "college"][i]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3">
                  {[
                    ["Cornell fit", "1.3 UTR gap", "Ivy League · academic reach"],
                    ["This week", "9.5h planned", "serve pattern + match set"],
                    ["Coach outreach", "3 drafts ready", "specific to roster needs"],
                  ].map(([title, stat, detail], i) => (
                    <div
                      key={title}
                      className="rounded-[18px] border-[0.5px] border-line bg-card p-5"
                    >
                      <p className="text-xs uppercase tracking-wide text-stone-light">
                        {title}
                      </p>
                      <p className="mt-1 text-2xl font-light text-ink">{stat}</p>
                      <p className="mt-1 text-sm text-stone">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>

          {/* hero stat strip */}
          <FadeIn delay={0.15} className="mx-auto mt-16 max-w-3xl">
            <div className="grid grid-cols-1 divide-y-[0.5px] divide-line rounded-card border-[0.5px] border-line bg-card/70 py-6 shadow-soft backdrop-blur-sm sm:grid-cols-3 sm:divide-x-[0.5px] sm:divide-y-0">
              <div className="px-4 py-3 text-center sm:py-0">
                <div className="text-3xl font-light text-grass">
                  <AnimatedNumber value={1200} suffix="+" />
                </div>
                <p className="mt-1 text-xs text-stone-light">
                  D1 · D2 · D3 programs tracked
                </p>
              </div>
              <div className="px-4 py-3 text-center sm:py-0">
                <div className="font-serif text-3xl italic text-grass">
                  Men's &amp; women's
                </div>
                <p className="mt-1 text-xs text-stone-light">
                  roadmaps, tuned separately
                </p>
              </div>
              <div className="px-4 py-3 text-center sm:py-0">
                <div className="text-3xl font-light text-grass">
                  Grade <span className="text-stone-light">+</span> gender
                </div>
                <p className="mt-1 text-xs text-stone-light">
                  personalized UTR targets
                </p>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-stone-light">
              Built by competitive juniors who lived the recruiting maze.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ------------------------------------------------ PRODUCT EXPLAINERS */}
      <section className="py-24">
        <div className="mx-auto max-w-content container-px">
          <FadeIn className="mx-auto max-w-2xl text-center">
            <p className="font-serif text-lg italic text-leaf-accent">
              What families actually use
            </p>
            <h2 className="mt-2 text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
              A recruiting system, not another spreadsheet.
            </h2>
          </FadeIn>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PRODUCT_STEPS.map((item, i) => (
              <FadeIn key={item.id} delay={i * 0.1}>
                <Card id={item.id} interactive className="h-full scroll-mt-24 p-7">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-grass text-cream">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-5 font-serif text-base italic text-leaf-accent">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-medium text-ink">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-stone">{item.body}</p>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ RECRUITING TIMELINE */}
      <section className="bg-grass py-24 text-cream">
        <div className="mx-auto max-w-content container-px">
          <FadeIn className="max-w-2xl">
            <p className="font-serif text-lg italic text-leaf-accent">
              Recruiting timeline
            </p>
            <h2 className="mt-2 text-balance text-3xl font-light tracking-tight sm:text-4xl">
              Know what matters before coaches start comparing lists.
            </h2>
          </FadeIn>
          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {[
              ["8th-9th", "Build technical base and tournament rhythm."],
              ["10th", "Identify schools where your UTR arc is credible."],
              ["11th", "Play the right events and send specific updates."],
              ["12th", "Narrow fit, visits, applications, and coach dialogue."],
            ].map(([label, body], i) => (
              <FadeIn key={label} delay={i * 0.08}>
                <div className="rounded-card border border-cream/12 bg-cream/8 p-5">
                  <p className="flex h-9 w-9 items-center justify-center rounded-full bg-leaf-accent text-sm font-medium text-grass">
                    {i + 1}
                  </p>
                  <h3 className="mt-5 text-lg font-medium">{label}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-cream/72">{body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ TRUST */}
      <section id="trust" className="scroll-mt-20 py-24">
        <div className="mx-auto grid max-w-content gap-10 container-px lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <FadeIn>
            <p className="font-serif text-lg italic text-leaf-accent">
              Why parents trust it
            </p>
            <h2 className="mt-2 text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
              Clear enough for the player. Detailed enough for the parent.
            </h2>
            <p className="mt-4 leading-relaxed text-stone">
              Seeded keeps the emotional parts of recruiting grounded in real inputs:
              UTR, grade, gender, target schools, training load, and outreach history.
            </p>
          </FadeIn>
          <div className="grid gap-3">
            {[
              [ShieldCheck, "Transparent fit", "See whether a school is a reach, match, or safer target before spending a tournament weekend chasing the wrong level."],
              [GraduationCap, "Academic context", "Balance tennis ambition with rankings, deadlines, cost signals, and campus fit."],
              [CheckCircle2, "Actionable next steps", "Every page points toward something concrete: add a session, compare a school, draft an email, or update progress."],
            ].map(([Icon, title, body], i) => (
              <FadeIn key={String(title)} delay={i * 0.08}>
                <Card className="flex gap-4 p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-grass-50 text-grass">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-medium text-ink">{String(title)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-stone">{String(body)}</p>
                  </div>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- TARGETING / MARQUEE */}
      <section className="border-y-[0.5px] border-line bg-cream py-12">
        <div className="mx-auto max-w-content container-px">
          <FadeIn className="mb-6 text-center">
            <p className="text-sm text-stone">
              Families on Seeded are targeting programs like
            </p>
          </FadeIn>
        </div>
        <FadeIn delay={0.1}>
          <SchoolMarquee schools={marqueeSchools} />
        </FadeIn>
      </section>

      {/* ------------------------------------------------------ HOW IT WORKS */}
      <section id="how-it-works" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-content container-px">
          <FadeIn className="max-w-2xl">
            <p className="font-serif text-lg italic text-leaf-accent">
              How it works
            </p>
            <h2 className="mt-2 text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
              From confused to committed, in three steps.
            </h2>
          </FadeIn>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map((step, i) => (
              <FadeIn key={step.numeral} delay={i * 0.12}>
                <div className="flex flex-col">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-grass font-serif text-2xl italic text-cream shadow-soft">
                    {step.numeral}
                  </span>
                  <h3 className="mt-6 text-xl font-medium text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-pretty leading-relaxed text-stone">
                    {step.body}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- FEATURES */}
      <section className="bg-grass-50/40 py-24">
        <div className="mx-auto max-w-content container-px">
          <FadeIn className="mx-auto max-w-2xl text-center">
            <p className="font-serif text-lg italic text-grass">
              Everything in one place
            </p>
            <h2 className="mt-2 text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
              The recruiting tools families wish they'd had sooner.
            </h2>
          </FadeIn>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FadeIn key={f.badge} delay={i * 0.12}>
                <Card interactive className="h-full p-7">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-grass text-cream">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <Badge variant="lime" size="sm" className="mt-5">
                    {f.badge}
                  </Badge>
                  <h3 className="mt-3 text-xl font-medium text-ink">
                    {f.title}
                  </h3>
                  <p className="mt-3 text-pretty leading-relaxed text-stone">
                    {f.body}
                  </p>
                </Card>
              </FadeIn>
            ))}
          </div>

          {/* highlight banner */}
          <FadeIn delay={0.2} className="mt-10">
            <Card className="flex flex-col items-start justify-between gap-6 bg-grass p-8 text-cream sm:flex-row sm:items-center">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream/15">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-xl font-medium">
                    Browsing schools is always free.
                  </h3>
                  <p className="mt-1 max-w-lg text-pretty text-cream/80">
                    Search every program across men's and women's D1, D2 and D3 —
                    real roster UTRs, minimum competitive levels, and academic
                    rankings. No account required.
                  </p>
                </div>
              </div>
              <Link
                href="/schools"
                className={buttonVariants({ variant: "leaf", size: "md" })}
              >
                Explore schools
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          </FadeIn>
        </div>
      </section>

      {/* ------------------------------------------------------ TESTIMONIALS */}
      <section id="testimonials" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-content container-px">
          <FadeIn className="max-w-2xl">
            <p className="font-serif text-lg italic text-leaf-accent">
              From the families
            </p>
            <h2 className="mt-2 text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
              Built for the parents in the bleachers.
            </h2>
          </FadeIn>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <FadeIn key={t.id} delay={i * 0.12}>
                <Card className="flex h-full flex-col p-7">
                  <Quote className="h-7 w-7 text-leaf-accent" />
                  <p className="mt-4 flex-1 text-pretty leading-relaxed text-ink">
                    "{t.quote}"
                  </p>
                  <div className="mt-6 border-t-[0.5px] border-line pt-4">
                    <p className="font-medium text-ink">{t.parentName}</p>
                    <p className="text-sm text-stone">
                      {t.relationship} · {t.location}
                    </p>
                    <Badge variant="default" size="sm" className="mt-3">
                      <Target className="h-3 w-3" />
                      {t.outcome}
                    </Badge>
                  </div>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ CTA */}
      <section className="pb-24">
        <div className="mx-auto max-w-content container-px">
          <FadeIn>
            <div className="relative overflow-hidden rounded-card border-[0.5px] border-line bg-card px-6 py-16 text-center shadow-soft">
              <FloatingDots />
              <div className="relative mx-auto max-w-2xl">
                <h2 className="text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
                  Start mapping your path to{" "}
                  <span className="serif-accent text-grass">college tennis</span>{" "}
                  today.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-pretty text-stone">
                  Two minutes to your first roadmap. Free to explore, always.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/signup"
                    className={buttonVariants({ variant: "primary", size: "lg" })}
                  >
                    Build my roadmap
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/pricing"
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    See pricing
                  </Link>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <Footer />
    </>
  );
}
