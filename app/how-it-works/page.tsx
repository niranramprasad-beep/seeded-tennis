"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, Mail, Route, School } from "lucide-react";
import { Reveal } from "@/components/shared/reveal";
import { seededButtonVariants } from "@/components/seeded/ui/button";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: ClipboardList,
    title: "Build the player profile",
    body: "Seeded starts with your UTR, grad year and team (men's or women's). Everything else — GPA, target schools, the things you're working on — you add when you want to.",
  },
  {
    icon: School,
    title: "Match schools honestly",
    body: "Each program is compared with your UTR, or the plan UTR you set, against its range (a hand-checked roster where we have one, our estimate elsewhere) — a Safe bet, Good match, Stretch or Long shot. Academics, division and region are filters you choose; they don't change your fit.",
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
  return <SeededHowItWorks />;
}

function SeededHowItWorks() {
  // Design system v2: plain ink headline, equal-height cards (rule 5), one
  // green button (rule 1), the shared rhythm (rule 7). This page still had
  // the pre-redesign glass/gradient styling: a gradient pill button,
  // gradient numerals and a bento of uneven cards.
  return (
    <div className="seeded-section-y mx-auto max-w-[1200px] px-6">
      <Reveal className="seeded-section-head max-w-3xl">
        <p className="seeded-eyebrow">How it works</p>
        <h1 className="text-balance font-seeded text-[40px] font-bold leading-[1.08] tracking-[-0.02em] text-ink sm:text-5xl">
          Recruiting clarity from the first profile to the first coach reply.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone">
          Seeded connects the pieces families usually manage separately: schools,
          UTR targets, a training calendar you fill in, tournaments, and outreach.
        </p>
      </Reveal>
      <ol className="seeded-card-row grid-cols-1 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title} className="h-full">
            <Reveal index={index} step={0.06} className="flex h-full flex-col rounded-card border border-line bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-grass-50 text-grass">
                  <step.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="font-mono text-2xl tabular-nums text-stone" aria-hidden>
                  0{index + 1}
                </span>
              </div>
              <h2 className="mt-5 font-seeded text-xl font-semibold text-ink">{step.title}</h2>
              <p className="mt-2 leading-relaxed text-stone">{step.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
      <div className="mt-10">
        <Link href="/onboarding" className={cn(seededButtonVariants({ variant: "primary" }), "group gap-2")}>
          Get my free fit report
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
