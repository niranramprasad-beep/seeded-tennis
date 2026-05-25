"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Mail,
  Menu,
  Route,
  School,
  X,
  LogOut,
  Settings,
  ChevronRight,
} from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { TierSwitcher } from "./tier-switcher";
import { cn } from "@/lib/utils";

const MARKETING_LINKS = [
  { href: "/#roadmap-preview", label: "Roadmap" },
  { href: "/schools", label: "Schools" },
  { href: "/#training-preview", label: "Training" },
  { href: "/#trust", label: "For parents" },
  { href: "/pricing", label: "Pricing" },
];

const APP_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/roadmap", label: "Roadmap", icon: Route },
  { href: "/training", label: "Training", icon: CalendarDays },
  { href: "/schools", label: "Schools", icon: School },
  { href: "/coaches", label: "Coaches", icon: Mail },
];

export function Nav() {
  const { isAuthed, hydrated, signOut } = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const showApp = hydrated && isAuthed;
  const links = showApp ? APP_LINKS : MARKETING_LINKS;

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  const isActive = (href: string) =>
    href.startsWith("/#") ? false : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-50 border-b-[0.5px] border-line bg-cream/88 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-content items-center justify-between container-px">
        <Link
          href={showApp ? "/dashboard" : "/"}
          className="flex items-center gap-2"
          onClick={() => setOpen(false)}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-tennis ring-1 ring-grass/15" />
          <span className="font-serif text-[26px] italic leading-none text-grass">
            Seeded
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 rounded-full border-[0.5px] border-line bg-card/72 p-1 shadow-soft lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "relative rounded-full px-3.5 py-2 text-sm transition-all duration-200 hover:text-ink",
                isActive(l.href)
                  ? "bg-grass text-cream shadow-soft"
                  : "text-stone hover:bg-grass-50"
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-4 lg:flex">
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
                className="text-sm text-stone transition-colors hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className={buttonVariants({ variant: "primary", size: "sm" })}
              >
                Build roadmap
                <ChevronRight className="h-4 w-4" />
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
              {links.map((l) => (
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
                      Get started
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {showApp && (
        <div className="hidden border-t-[0.5px] border-line/70 bg-card/52 lg:block">
          <div className="mx-auto flex h-12 max-w-content items-center justify-between gap-4 container-px">
            <div className="flex items-center gap-2 text-xs text-stone-light">
              <BarChart3 className="h-3.5 w-3.5 text-grass" />
              <span>Recruiting workspace</span>
            </div>
            <div className="flex items-center gap-1">
              {APP_LINKS.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "group flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-all duration-200",
                      isActive(l.href)
                        ? "bg-grass-50 text-grass ring-1 ring-grass/12"
                        : "text-stone hover:bg-cream hover:text-ink"
                    )}
                  >
                    <Icon className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
