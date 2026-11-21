"use client";

import Link from "next/link";
import { CalendarCheck, MailCheck, ShieldCheck, TrendingUp } from "lucide-react";
import { Reveal } from "@/components/shared/reveal";
import { seededButtonVariants } from "@/components/seeded/ui/button";

const items = [
  {
    icon: ShieldCheck,
    title: "Know what is realistic",
    body: "See which programs fit the player's UTR and timeline — Likely, Target, Reach or Out of range — and filter by academics, division and region before spending another weekend chasing the wrong event.",
  },
  {
    icon: CalendarCheck,
    // Was "Turn recruiting goals into a training schedule that balances
    // court work, match play, strength, recovery, and school" — a generated
    // plan. Seeded does not generate training plans (CLAUDE.md: manual
    // calendar only), and a parent cannot see the player's calendar (the
    // training tables are own-row only).
    title: "See what's coming up",
    body: "The player keeps their own calendar of sessions and tournaments; you see the tournaments they've entered and what each one costs.",
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
  return <SeededParents />;
}

function SeededParents() {
  // Design system v2 (see the how-it-works page for the same treatment):
  // the gradient pill and glass buttons, 24px bento cards and gradient icon
  // tiles were the pre-redesign style. One green button, equal cards.
  return (
    <div className="seeded-section-y mx-auto max-w-[1200px] px-6">
      <Reveal className="seeded-section-head max-w-3xl">
        <p className="seeded-eyebrow">For parents</p>
        <h1 className="text-balance font-seeded text-[40px] font-bold leading-[1.08] tracking-[-0.02em] text-ink sm:text-5xl">
          A calmer way to manage college tennis recruiting.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone">
          Seeded gives families one place for school fit, UTR progress, tournaments,
          spending and coach outreach &mdash; without the spreadsheet spiral.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className={seededButtonVariants({ variant: "primary" })}>
            Start a family account
          </Link>
          <Link href="/pricing" className={seededButtonVariants({ variant: "secondary" })}>
            See plans
          </Link>
        </div>
      </Reveal>

      <ul className="seeded-card-row grid-cols-1 md:grid-cols-2">
        {items.map((item, i) => (
          <li key={item.title} className="h-full">
            <Reveal index={i} step={0.06} className="flex h-full flex-col rounded-xl border border-line bg-card p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-grass-50 text-grass">
                <item.icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-5 font-seeded text-xl font-semibold text-ink">{item.title}</h2>
              <p className="mt-2 leading-relaxed text-stone">{item.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}
