"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useDesign } from "@/lib/context/design-context";
import { cn } from "@/lib/utils";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/schools", label: "Browse schools" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/training", label: "Training plans" },
      { href: "/tournament-fit", label: "Tournament fit" },
      { href: "/coaches", label: "Coach outreach" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/signup", label: "Get started" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/terms#privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function Footer() {
  const { design } = useDesign();
  const isPremium = design === "premium";

  return (
    <footer
      className={cn(
        isPremium ? "premium-glass border-t-0" : "border-t-[0.5px] border-line bg-card"
      )}
    >
      <div className="mx-auto max-w-content container-px py-14">
        {/*
          grid-cols-1 isn't decorative — without an explicit mobile track,
          a bare `grid` defaults to implicit auto-sized columns (sized to
          content, e.g. "Coach outreach"/"Tournament fit" link text), which
          can overflow the viewport instead of shrinking to it.
        */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={isPremium ? { background: "var(--p-accent-gradient)" } : undefined}
              />
              <span
                className={cn(
                  isPremium
                    ? "font-premium text-xl font-semibold tracking-tight text-ink"
                    : "font-serif text-[26px] italic leading-none text-grass"
                )}
              >
                Seeded
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-stone">
              A clear, realistic path to college tennis — built for junior
              players and the families guiding them.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4
                className={cn(
                  "text-xs font-medium uppercase tracking-[0.12em] text-stone-light",
                  isPremium && "font-premium"
                )}
              >
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className={cn(
                        "group inline-flex items-center gap-1 text-sm text-stone transition-colors hover:text-ink",
                        isPremium && "font-premium"
                      )}
                    >
                      {l.label}
                      <ArrowUpRight className="h-3 w-3 -translate-x-1 opacity-0 transition-[transform,opacity] duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          className={cn(
            "mt-12 flex flex-col items-start justify-between gap-3 border-t pt-6 text-xs text-stone-light sm:flex-row sm:items-center",
            isPremium ? "border-[rgb(var(--c-line))]" : "border-line"
          )}
        >
          <p className={cn(isPremium && "font-premium")}>
            © {new Date().getFullYear()} Seeded. Built for tennis families.
          </p>
          <p className={cn(isPremium ? "font-premium" : "font-serif italic", "text-stone")}>
            Your path to college tennis, mapped match by match.
          </p>
        </div>
      </div>
    </footer>
  );
}
