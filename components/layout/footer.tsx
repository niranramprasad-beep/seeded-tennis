"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/config/contact";
import { useDesign } from "@/lib/context/design-context";
import { cn } from "@/lib/utils";

const COLUMNS: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}[] = [
  {
    title: "Platform",
    links: [
      { href: "/schools", label: "Browse schools" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/training", label: "Training calendar" },
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
      // "Methodology" was missing here while the homepage footer had it,
      // and this is the footer that actually renders on /pricing,
      // /schools, every school page, /tournament-fit, /how-it-works and
      // /parents. Two footers disagreeing about what the site contains.
      { href: "/methodology", label: "Methodology" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      // The support address existed on exactly one page — the homepage.
      { href: `mailto:${SUPPORT_EMAIL}`, label: SUPPORT_EMAIL, external: true },
    ],
  },
];

export function Footer() {
  const { design, setDesign } = useDesign();
  const isSeeded = design === "seeded";

  return (
    <footer
      className={cn(
        isSeeded ? "seeded-glass border-t-0" : "border-t-[0.5px] border-line bg-card"
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
                style={isSeeded ? { background: "var(--s-accent-gradient)" } : undefined}
              />
              <span
                className={cn(
                  isSeeded
                    ? "font-seeded text-xl font-semibold tracking-tight text-ink"
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
              {/* h2, not h4. These are the footer's own top-level sections,
                  and every page that ends with the footer jumped h1 -> h4
                  (or h2 -> h4), which Lighthouse flags as heading-order on
                  /pricing, /schools and every school page. The visual size
                  comes from the classes, not the tag. */}
              <h2
                className={cn(
                  "text-xs font-medium uppercase tracking-[0.12em] text-stone-light",
                  isSeeded && "font-seeded"
                )}
              >
                {col.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => {
                  const className = cn(
                    "group inline-flex min-h-11 items-center gap-1 break-all text-sm text-stone transition-colors hover:text-ink sm:min-h-0",
                    isSeeded && "font-seeded"
                  );
                  // next/link would try to route a mailto: internally.
                  return (
                    <li key={l.label}>
                      {l.external ? (
                        <a href={l.href} className={className}>
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className={className}>
                          {l.label}
                          <ArrowUpRight className="h-3 w-3 -translate-x-1 opacity-0 transition-[transform,opacity] duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div
          className={cn(
            "mt-12 flex flex-col items-start justify-between gap-3 border-t pt-6 text-xs text-stone-light sm:flex-row sm:items-center",
            isSeeded ? "border-[rgb(var(--c-line))]" : "border-line"
          )}
        >
          <p className={cn(isSeeded && "font-seeded")}>
            © {new Date().getFullYear()} Seeded. Built for tennis families.
          </p>
          <p className={cn(isSeeded ? "font-seeded" : "font-serif italic", "text-stone")}>
            Your path to college tennis, mapped match by match.
          </p>
          {isSeeded && (
            <button
              onClick={() => setDesign("legacy")}
              className="inline-flex min-h-11 items-center font-seeded text-xs text-stone-light underline-offset-2 transition-colors hover:text-ink hover:underline sm:min-h-0"
            >
              Switch to Legacy
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
