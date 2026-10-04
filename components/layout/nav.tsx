"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DarkModeToggle } from "@/components/shared/dark-mode-toggle";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };

// This is the marketing-site header only — signed-in users get the app
// shell's left sidebar (components/layout/sidebar.tsx) instead. See
// components/layout/app-shell.tsx for the switch between the two.
const MARKETING_LINKS: NavLink[] = [
  { href: "/schools", label: "Schools" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/parents", label: "For parents" },
  { href: "/pricing", label: "Pricing" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isMarketingHome = pathname === "/";

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header
      className={cn(
        "top-0 z-50 border-b-[0.5px] backdrop-blur-xl transition-colors duration-300",
        isMarketingHome
          ? "fixed inset-x-0 border-line/70 bg-cream/80 text-ink"
          : "sticky border-line bg-cream/85"
      )}
    >
      <nav className="mx-auto flex h-16 max-w-content items-center justify-between container-px">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="h-2.5 w-2.5 rounded-full bg-tennis ring-1 ring-grass/15" />
          <span className="font-serif text-[26px] italic leading-none text-grass">Seeded</span>
        </Link>

        <div
          className={cn(
            "hidden items-center gap-1 rounded-full border-[0.5px] p-1 shadow-soft lg:flex",
            isMarketingHome
              ? "border-line bg-white/70 text-ink backdrop-blur-2xl"
              : "border-line bg-card/70"
          )}
        >
          {MARKETING_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm transition-all duration-200 hover:-translate-y-0.5",
                isActive(l.href)
                  ? "bg-grass text-on-primary shadow-soft"
                  : isMarketingHome
                    ? "text-stone hover:bg-grass-50 hover:text-grass"
                    : "text-stone hover:bg-grass-50 hover:text-ink"
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <DarkModeToggle />
          <Link
            href="/login"
            className={cn(
              "text-sm transition-all duration-200 hover:-translate-y-0.5",
              isMarketingHome ? "text-stone hover:text-ink" : "text-stone hover:text-ink"
            )}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className={cn(buttonVariants({ variant: "primary", size: "sm" }), "group")}
          >
            Request access
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-grass-50 focus:outline-none focus:ring-2 focus:ring-grass/30 lg:hidden"
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
            className="border-t-[0.5px] border-line bg-cream/96 shadow-lift lg:hidden"
          >
            <div className="flex flex-col gap-1 container-px py-4">
              <DarkModeToggle showLabel className="mb-2 border-[0.5px] border-line" />
              {MARKETING_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-2xl px-3 py-3 text-sm transition-colors",
                    isActive(l.href)
                      ? "bg-grass text-on-primary"
                      : "text-stone hover:bg-grass-50 hover:text-ink"
                  )}
                >
                  <span>{l.label}</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t-[0.5px] border-line pt-4">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ variant: "outline", size: "md" })}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ variant: "primary", size: "md" })}
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
