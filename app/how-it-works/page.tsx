"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, Mail, Route, School } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";
import { FadeIn } from "@/components/shared/fade-in";
import { Reveal } from "@/components/shared/reveal";
import { Magnetic } from "@/components/shared/magnetic";
import { SpotlightCard } from "@/components/shared/spotlight-card";
import { BentoGrid, BentoCell } from "@/components/seeded/shared/bento-grid";
import { useDesign } from "@/lib/context/design-context";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: ClipboardList,
    title: "Build the player profile",
    body: "Seeded starts with grade, gender, UTR, goals, target schools, weaknesses, and training availability.",
  },
  {
    icon: School,
    title: "Match schools honestly",
    body: "Programs are compared by roster level, minimum competitive UTR, academics, conference, and location.",
  },
  {
    icon: Route,
    title: "Set senior-summer targets",
    body: "The roadmap works backward from the UTR needed by the summer before senior year.",
  },
  {
    icon: Mail,
    title: "Organize outreach",
    body: "Coach emails, contacted status, replies, and follow-ups stay attached to the target-school list.",
  },
];

export default function HowItWorksPage() {
  const { design } = useDesign();
  return design === "seeded" ? <SeededHowItWorks /> : <LegacyHowItWorks />;
}

function LegacyHowItWorks() {
  return (
    <>
      <div className="mx-auto max-w-content container-px py-16">
        <FadeIn>
          <Badge variant="leaf" size="md">How it works</Badge>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-light tracking-tight text-ink sm:text-6xl">
            Recruiting clarity from the first profile to the first coach reply.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone">
            Seeded connects the pieces families usually manage separately: schools,
            UTR targets, training weeks, tournaments, and outreach.
          </p>
        </FadeIn>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {steps.map((step, index) => (
            <FadeIn key={step.title} delay={index * 0.08}>
              <Card interactive className="h-full p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-grass text-on-primary">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="font-serif text-3xl italic text-leaf-accent">0{index + 1}</span>
                </div>
                <h2 className="mt-5 text-xl font-medium text-ink">{step.title}</h2>
                <p className="mt-2 leading-relaxed text-stone">{step.body}</p>
              </Card>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={0.2} className="mt-10">
          <Link href="/signup" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "group")}>
            Build my roadmap
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </FadeIn>
      </div>
      <Footer />
    </>
  );
}

function SeededHowItWorks() {
  return (
    <>
      <div className="mx-auto max-w-content container-px py-24">
        <Reveal>
          <span className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
            How it works
          </span>
          <h1 className="mt-5 max-w-3xl text-balance font-seeded text-5xl font-semibold leading-[0.97] tracking-tight text-ink sm:text-6xl">
            Recruiting clarity from the first profile to the first coach reply.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone">
            Seeded connects the pieces families usually manage separately: schools,
            UTR targets, training weeks, tournaments, and outreach.
          </p>
        </Reveal>
        <BentoGrid className="mt-14">
          {steps.map((step, index) => (
            <BentoCell key={step.title} span={index % 2 === 0 ? 8 : 4}>
              <Reveal index={index} step={0.07} className="h-full">
                <SpotlightCard className="seeded-glass flex h-full flex-col rounded-[24px] p-7 shadow-seeded-1">
                  <div className="flex items-center justify-between">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                      style={{ background: "var(--s-accent-gradient)" }}
                    >
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span className="seeded-gradient-text font-mono text-3xl">0{index + 1}</span>
                  </div>
                  <h2 className="mt-5 font-seeded text-xl font-medium text-ink">{step.title}</h2>
                  <p className="mt-2 leading-relaxed text-stone">{step.body}</p>
                </SpotlightCard>
              </Reveal>
            </BentoCell>
          ))}
        </BentoGrid>
        <Reveal index={4} step={0.07} className="mt-12">
          <Magnetic strength={0.3}>
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-pill px-6 py-3.5 font-seeded text-sm font-semibold text-white shadow-seeded-2"
              style={{ background: "var(--s-accent-gradient)" }}
            >
              Build my roadmap
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Magnetic>
        </Reveal>
      </div>
      <Footer />
    </>
  );
}
