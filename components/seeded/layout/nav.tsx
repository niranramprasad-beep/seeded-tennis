"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Menu, X, ChevronRight } from "lucide-react";
import { DarkModeToggle } from "@/components/shared/dark-mode-toggle";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };

const MARKETING_LINKS: NavLink[] = [
  { href: "/schools", label: "Schools" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/parents", label: "For parents" },
  { href: "/pricing", label: "Pricing" },
];

// Same scroll-shrink/positioning/mobile-panel behavior as Legacy's Nav
// (components/layout/nav.tsx) — only the visual language differs.
export function SeededNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isMarketingHome = pathname === "/";
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 12);
  });

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header
      className={cn(
        "top-0 z-50 transition-[background-color,box-shadow] duration-300",
        isMarketingHome ? "fixed inset-x-0" : "sticky",
        scrolled && "seeded-glass shadow-seeded-1"
      )}
    >
      <nav
        className={cn(
          "mx-auto flex max-w-content items-center justify-between container-px transition-[height] duration-300",
          scrolled ? "h-14" : "h-16"
        )}
      >
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--s-accent-gradient)" }}
          />
          <span className="font-seeded text-xl font-semibold tracking-tight text-ink">Seeded</span>
        </Link>

        <div className="seeded-glass hidden items-center gap-1 rounded-full p-1 lg:flex">
          {MARKETING_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3.5 py-2 font-seeded text-sm transition-all duration-200",
                isActive(l.href) ? "text-on-primary" : "text-stone hover:text-ink"
              )}
              style={isActive(l.href) ? { background: "var(--s-accent-gradient)" } : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <DarkModeToggle />
          <Link href="/login" className="font-seeded text-sm text-stone transition-colors hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="group flex items-center gap-1.5 rounded-pill px-4 py-2 font-seeded text-sm font-medium text-on-primary shadow-seeded-1"
            style={{ background: "var(--s-accent-gradient)" }}
          >
            Request access
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="seeded-glass shadow-seeded-2 lg:hidden"
          >
            <div className="flex flex-col gap-1 container-px py-4">
              <DarkModeToggle showLabel className="mb-2" />
              {MARKETING_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-2xl px-3 py-3 font-seeded text-sm transition-colors",
                    isActive(l.href) ? "text-on-primary" : "text-stone hover:text-ink"
                  )}
                  style={isActive(l.href) ? { background: "var(--s-accent-gradient)" } : undefined}
                >
                  <span>{l.label}</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-[rgb(var(--c-line))] pt-4">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-pill border border-[rgb(var(--c-line))] py-3 text-center font-seeded text-sm font-medium text-ink"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="rounded-pill py-3 text-center font-seeded text-sm font-medium text-on-primary"
                  style={{ background: "var(--s-accent-gradient)" }}
                >
                  Request access
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
