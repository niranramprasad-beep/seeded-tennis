"use client";

import Link from "next/link";
import { CalendarCheck, MailCheck, ShieldCheck, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";
import { FadeIn } from "@/components/shared/fade-in";
import { Reveal } from "@/components/shared/reveal";
import { SpotlightCard } from "@/components/shared/spotlight-card";
import { BentoGrid, BentoCell } from "@/components/seeded/shared/bento-grid";
import { useDesign } from "@/lib/context/design-context";

const items = [
  {
    icon: ShieldCheck,
    title: "Know what is realistic",
    body: "See which programs fit the player's current UTR, academic goals, gender, and timeline before spending another weekend chasing the wrong event.",
  },
  {
    icon: CalendarCheck,
    title: "Plan the week",
    body: "Turn recruiting goals into a training schedule that balances court work, match play, strength, recovery, and school.",
  },
  {
    icon: TrendingUp,
    title: "Track progress",
    body: "Log UTR updates and tournament volume so the family can see whether the plan is working.",
  },
  {
    icon: MailCheck,
    title: "Keep outreach organized",
    body: "Draft specific coach emails, track replies, and keep the recruiting conversation in one place.",
  },
];

export default function ParentsPage() {
  const { design } = useDesign();
  return design === "seeded" ? <SeededParents /> : <LegacyParents />;
}

function LegacyParents() {
  return (
    <>
      <div className="mx-auto max-w-content container-px py-16">
        <FadeIn className="max-w-3xl">
          <Badge variant="leaf" size="md">For parents</Badge>
          <h1 className="mt-5 text-balance text-4xl font-light tracking-tight text-ink sm:text-6xl">
            A calmer way to manage{" "}
            <span className="serif-accent text-grass">college tennis</span> recruiting.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone">
            Seeded gives families a shared recruiting plan: school fit, UTR targets,
            training load, tournaments, and coach outreach without the spreadsheet spiral.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Start a family account
            </Link>
            <Link href="/pricing" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See plans
            </Link>
          </div>
        </FadeIn>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {items.map((item, i) => (
            <FadeIn key={item.title} delay={i * 0.08}>
              <Card interactive className="h-full p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-grass text-on-primary">
                  <item.icon className="h-5 w-5" />
                </span>
                <h2 className="mt-5 text-xl font-medium text-ink">{item.title}</h2>
                <p className="mt-2 leading-relaxed text-stone">{item.body}</p>
              </Card>
            </FadeIn>
          ))}
        </div>
      </div>
      <Footer />
    </>
  );
}

function SeededParents() {
  // Deliberately the calmest page in the Seeded system — muted glass (no
  // gradient-mesh backdrop, no cursor glow), generous whitespace, a single
  // quiet accent instead of the homepage's full "under the lights" energy.
  // Per spec: "a distinct, calmer feel: trust, cost clarity, honesty."
  return (
    <>
      <div className="mx-auto max-w-content container-px py-24">
        <Reveal className="max-w-3xl">
          <span className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
            For parents
          </span>
          <h1 className="mt-5 text-balance font-seeded text-5xl font-semibold leading-[0.97] tracking-tight text-ink sm:text-6xl">
            A calmer way to manage college tennis recruiting.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone">
            Seeded gives families a shared recruiting plan: school fit, UTR targets,
            training load, tournaments, and coach outreach without the spreadsheet spiral.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-pill px-6 py-3.5 text-center font-seeded text-sm font-semibold text-white"
              style={{ background: "var(--s-accent-gradient)" }}
            >
              Start a family account
            </Link>
            <Link
              href="/pricing"
              className="seeded-glass rounded-pill px-6 py-3.5 text-center font-seeded text-sm font-semibold text-ink"
            >
              See plans
            </Link>
          </div>
        </Reveal>

        <BentoGrid className="mt-16">
          {items.map((item, i) => (
            <BentoCell key={item.title} span={6}>
              <Reveal index={i} step={0.08} className="h-full">
                <SpotlightCard className="flex h-full flex-col rounded-[24px] border border-[rgb(var(--c-line))] bg-card p-7">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ background: "rgb(var(--c-primary) / 0.12)", color: "rgb(var(--c-primary))" }}
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h2 className="mt-5 font-seeded text-xl font-medium text-ink">{item.title}</h2>
                  <p className="mt-2 leading-relaxed text-stone">{item.body}</p>
                </SpotlightCard>
              </Reveal>
            </BentoCell>
          ))}
        </BentoGrid>
      </div>
      <Footer />
    </>
  );
}
