"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  Compass,
  LayoutDashboard,
  Mail,
  Menu,
  Route,
  School,
  Trophy,
  Users,
  X,
  LogOut,
  Settings,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { TierSwitcher } from "./tier-switcher";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon?: LucideIcon };

// Note: the Tournament Fit Finder intentionally has no top-nav tab here — it
// lives as its own section on the landing page (which links to the full tool).
const MARKETING_LINKS: NavLink[] = [
  { href: "/schools", label: "Schools" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/parents", label: "For parents" },
  { href: "/pricing", label: "Pricing" },
];

const APP_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/roadmap", label: "Roadmap", icon: Route },
  { href: "/training", label: "Training", icon: CalendarDays },
  { href: "/match-mode", label: "Match mode", icon: Trophy },
  { href: "/tournament-fit", label: "Tournament fit", icon: Compass },
  { href: "/schools", label: "Schools", icon: School },
  { href: "/coaches", label: "Coaches", icon: Mail },
  { href: "/friends", label: "Friends", icon: Users },
];

const PARENT_LINKS: NavLink[] = [
  { href: "/family", label: "Family", icon: Users },
  { href: "/cost-calculator", label: "Costs", icon: BarChart3 },
  { href: "/tournament-fit", label: "Tournament fit", icon: Compass },
  { href: "/schools", label: "Schools", icon: School },
];

export function Nav() {
  const { isAuthed, hydrated, player, signOut } = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const showApp = hydrated && isAuthed;
  const isParent = showApp && player.role === "parent";
  const appLinks = isParent ? PARENT_LINKS : APP_LINKS;
  const mobileLinks = showApp ? appLinks : MARKETING_LINKS;
  const isMarketingHome = !showApp && pathname === "/";

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header
      className={cn(
        "top-0 z-50 border-b-[0.5px] backdrop-blur-xl transition-colors duration-300",
        isMarketingHome
          ? "fixed inset-x-0 border-line/70 bg-[#FBFAF3]/78 text-ink"
          : "sticky border-line bg-cream/85"
      )}
    >
      <nav className="mx-auto flex h-16 max-w-content items-center justify-between container-px">
        <Link
          href={showApp ? "/dashboard" : "/"}
          className="flex items-center gap-2"
          onClick={() => setOpen(false)}
        >
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full bg-tennis",
              isMarketingHome ? "ring-1 ring-grass/15" : "ring-1 ring-grass/15"
            )}
          />
          <span
            className={cn(
              "font-serif text-[26px] italic leading-none",
              isMarketingHome ? "text-grass" : "text-grass"
            )}
          >
            Seeded
          </span>
        </Link>

        {/* Marketing-only top links (app links live in the workspace row below) */}
        {!showApp && (
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
                    ? "bg-grass text-cream shadow-soft"
                    : isMarketingHome
                      ? "text-stone hover:bg-grass-50 hover:text-grass"
                      : "text-stone hover:bg-grass-50 hover:text-ink"
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}

        <div className="hidden items-center gap-3 lg:flex">
          {showApp ? (
            <>
              <TierSwitcher showLabel={false} />
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-full text-stone transition-colors hover:bg-grass-50 hover:text-ink"
              >
                <Settings className="h-4 w-4" />
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm text-stone transition-colors hover:text-ink"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
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
                className={cn(
                  buttonVariants({ variant: "primary", size: "sm" }),
                  "group"
                )}
              >
                Request access
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </>
          )}
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
              {mobileLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-2xl px-3 py-3 text-sm transition-colors",
                    isActive(l.href)
                      ? "bg-grass text-cream"
                      : "text-stone hover:bg-grass-50 hover:text-ink"
                  )}
                >
                  <span>{l.label}</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ))}
              <div className="mt-3 border-t-[0.5px] border-line pt-4">
                {showApp ? (
                  <div className="flex flex-col gap-4">
                    <TierSwitcher />
                    <Link
                      href="/settings"
                      onClick={() => setOpen(false)}
                      className="rounded-xl px-3 py-2.5 text-sm text-stone"
                    >
                      Settings
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleSignOut();
                        setOpen(false);
                      }}
                    >
                      Sign out
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
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
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single workspace nav row (app links live here only) */}
      {showApp && (
        <div className="hidden border-t-[0.5px] border-line/70 bg-card/55 lg:block">
          <div className="mx-auto flex h-12 max-w-content items-center gap-1 overflow-x-auto container-px">
            {appLinks.map((l) => {
              const Icon = l.icon!;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "group flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-all duration-200",
                    isActive(l.href)
                      ? "bg-grass text-cream shadow-soft"
                      : "text-stone hover:bg-grass-50 hover:text-ink"
                  )}
                >
                  <Icon className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
