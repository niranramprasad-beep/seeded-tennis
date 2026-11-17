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
//
// THE HEADER USED TO WRAP TO TWO ROWS AT EVERY DESKTOP WIDTH, and the cause
// was not "not enough room". The nav had `flex-wrap`, and TWO `flex-1`
// children: the links list and an empty `aria-hidden` spacer div. Two equal
// flex-1 siblings split the free space 50/50, so the links were handed
// exactly half of it — measured at 1440px: a 360px box holding ~480px of
// links, next to a 360px box holding nothing. `flex-wrap` then did the
// obvious thing and dropped "For parents" and "Pricing" onto a second row,
// making the header 94px tall instead of 65px on six pages.
//
// So: the spacer is gone, `flex-wrap` is gone, every link is
// `whitespace-nowrap`, and the end group is `shrink-0` so the links shrink
// before the sign-in/CTA pair ever does. There is a measured regression test
// for this — scripts/ui-audit.mjs records `distinctTops` and header height
// per width, and docs/screenshots/polish/after.json is the record.
// Board 21: the sign-in / sign-up / reset screens get a slim header with the
// logo only — the marketing links and the green CTA would compete with the
// one primary button on the card.
const LOGO_ONLY_ROUTES = ["/login", "/signup", "/reset-password", "/parent-login", "/parent-signup", "/auth/complete", "/auth/callback"];

function SeededLogo({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      className="flex min-h-11 shrink-0 items-center gap-2 font-seeded text-xl font-bold text-ink"
      onClick={onClick}
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="10" fill="rgb(var(--c-lime))" stroke="rgb(var(--c-ink))" strokeWidth="1.5" />
        <path d="M3 8c5 2 11 2 16 0M3 14c5-2 11-2 16 0" stroke="rgb(var(--c-ink))" strokeWidth="1.5" fill="none" />
      </svg>
      Seeded
    </Link>
  );
}

export function SeededNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  if (LOGO_ONLY_ROUTES.includes(pathname)) {
    return (
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-[1200px] items-center px-6 py-3.5">
          <SeededLogo />
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-line bg-cream">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1200px] flex-nowrap items-center gap-5 px-6 py-3.5 xl:gap-6"
      >
        <SeededLogo onClick={() => setOpen(false)} />

        <div className="hidden min-w-0 flex-1 items-center gap-4 text-[15px] lg:flex xl:gap-5">
          {MARKETING_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={cn(
                "inline-flex min-h-6 items-center whitespace-nowrap text-ink hover:text-grass",
                isActive(l.href) && "font-semibold text-grass"
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden shrink-0 items-center gap-4 lg:flex xl:gap-5">
          <Link href="/login" className="inline-flex min-h-6 items-center whitespace-nowrap text-[15px] text-ink hover:text-grass">
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-grass px-[18px] font-sans text-[15px] font-semibold text-on-primary hover:bg-grass-600"
          >
            Get my free fit report
          </Link>
        </div>

        <button
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink hover:border-line lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="seeded-mobile-menu"
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
            id="seeded-mobile-menu"
            className="overflow-hidden border-t border-line lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {MARKETING_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
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
                  className="rounded-lg border border-input py-3 text-center text-[15px] font-semibold text-ink"
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
