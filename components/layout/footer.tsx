"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      { href: "/events", label: "Training calendar" },
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

const LEGACY_FOOTER_ROUTES = ["/", "/parents", "/how-it-works", "/tournament-fit", "/schools", "/schools/", "/pricing"];

export function Footer({ inApp = false }: { inApp?: boolean } = {}) {
  const { design } = useDesign();
  const pathname = usePathname() ?? "/";
  const isSeeded = design === "seeded";

  if (isSeeded) return <SlimFooter inApp={inApp} />;
  // Legacy keeps its old footprint: the four-column footer only on the
  // marketing pages that rendered it before AppShell took over footers, not
  // on its app routes and auth screens (independent review, 2026-11-16).
  if (!LEGACY_FOOTER_ROUTES.some((r) => (r.endsWith("/") ? pathname.startsWith(r) : pathname === r))) return null;

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
                    "group inline-flex min-h-11 items-center gap-1 break-all text-sm text-stone transition-colors hover:text-ink sm:min-h-6",
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
        </div>
      </div>
    </footer>
  );
}

/**
 * Design system v2's ONE slim footer (docs/DESIGN_MOCKUP_SPEC_V2.md, shared
 * parts): Seeded · How we calculate fit · Privacy · Terms · support@. It is
 * rendered once, by AppShell, on every route — pages never render their own.
 *
 * Before this there were three footers: a four-column one on six marketing
 * pages, a minimal one on the homepage only, and nothing at all on
 * /methodology, /privacy, /terms, /contact, the auth pages and the app.
 *
 * The "Switch to Legacy" button that lived in the old footer is gone on
 * purpose: Legacy is a setting (Settings -> Appearance), not something a
 * first-time visitor should trip over (DECISIONS.md, 2026-11-16).
 */
// Pages whose content column is the 1200px marketing one (the public nav's
// width). Every other page a signed-in user sees inside the sidebar shell
// uses `max-w-content container-px`, and the footer follows that column.
const MARKETING_COLUMN_ROUTES = ["/", "/parents", "/how-it-works", "/methodology", "/onboarding", "/sample-report"];

function SlimFooter({ inApp }: { inApp: boolean }) {
  const pathname = usePathname() ?? "/";
  // PR-POLISH (2026-11-20): inside the app the footer used the marketing
  // column (1200px, 24px padding) while every app page uses max-w-content +
  // container-px, so at 1440 the footer text started ~17px left of the
  // content and its rule ran the full width of the window. It now sits in
  // the same column as the page above it, rule included.
  const appColumn = inApp && !MARKETING_COLUMN_ROUTES.includes(pathname);
  const linkClass =
    "inline-flex min-h-11 items-center text-stone underline-offset-2 transition-colors hover:text-ink hover:underline sm:min-h-6";
  return (
    <footer className={appColumn ? "mx-auto max-w-content container-px" : "border-t border-line"}>
      <div
        className={cn(
          "flex flex-col gap-x-6 gap-y-1 py-6 text-sm sm:flex-row sm:flex-wrap sm:items-center",
          appColumn ? "border-t border-line" : "mx-auto max-w-[1200px] px-6"
        )}
      >
        <span className="font-seeded font-semibold text-ink sm:mr-auto">Seeded</span>
        <Link href="/methodology" className={linkClass}>
          How we calculate fit
        </Link>
        <Link href="/privacy" className={linkClass}>
          Privacy
        </Link>
        <Link href="/terms" className={linkClass}>
          Terms
        </Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className={cn(linkClass, "break-all")}>
          {SUPPORT_EMAIL}
        </a>
      </div>
    </footer>
  );
}
