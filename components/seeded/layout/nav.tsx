"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };

// Pixel-exact to Main.dc.html's nav: "Fit report"/"Tournament checker" both
// point at the fit-report flow and the dedicated tournament checker —
// Main.dc.html itself links every non-CTA nav item to "#" (a mockup
// placeholder, not a real destination), so these are mapped to the closest
// real route rather than copied literally.
const MARKETING_LINKS: NavLink[] = [
  { href: "/onboarding", label: "Fit report" },
  { href: "/tournament-fit", label: "Tournament checker" },
  { href: "/schools", label: "Schools" },
  { href: "/sample-report", label: "For parents" },
  { href: "/pricing", label: "Pricing" },
];

// Plain static header (no fixed-over-hero/scroll-shrink/glass backdrop) —
// every one of the 11 mockups shows a simple bordered top bar in normal
// document flow, not the ambient floating nav the old Seeded design used.
export function SeededNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="border-b border-line bg-cream">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-6 px-6 py-3.5"
      >
        <Link
          href="/"
          className="flex items-center gap-2 font-seeded text-xl font-bold text-ink"
          onClick={() => setOpen(false)}
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
            <circle cx="11" cy="11" r="10" fill="rgb(var(--c-lime))" stroke="rgb(var(--c-ink))" strokeWidth="1.5" />
            <path d="M3 8c5 2 11 2 16 0M3 14c5-2 11-2 16 0" stroke="rgb(var(--c-ink))" strokeWidth="1.5" fill="none" />
          </svg>
          Seeded
        </Link>

        <div className="hidden flex-1 flex-wrap gap-5 text-[15px] lg:flex">
          {MARKETING_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn("text-ink hover:text-grass", isActive(l.href) && "font-semibold text-grass")}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="hidden flex-1 lg:block" aria-hidden={true} />

        <Link href="/login" className="hidden text-[15px] text-ink hover:text-grass lg:inline">
          Sign in
        </Link>
        <Link
          href="/onboarding"
          className="hidden min-h-11 items-center justify-center gap-2 rounded-lg bg-grass px-[18px] font-sans text-[15px] font-semibold text-on-primary hover:bg-grass-600 lg:inline-flex"
        >
          Get my free fit report
        </Link>

        <button
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg border border-transparent text-ink hover:border-line lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-line lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {MARKETING_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-3 text-[15px]",
                    isActive(l.href) ? "bg-grass-50 font-semibold text-grass" : "text-ink"
                  )}
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[#D6D3C8] py-3 text-center text-[15px] font-semibold text-ink"
                >
                  Sign in
                </Link>
                <Link
                  href="/onboarding"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-grass py-3 text-center text-[15px] font-semibold text-on-primary"
                >
                  Get my free fit report
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
