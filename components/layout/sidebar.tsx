"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { useSidebar } from "@/lib/context/sidebar-context";
import { TierSwitcher } from "./tier-switcher";
import { DarkModeToggle } from "@/components/shared/dark-mode-toggle";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon };

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
  { href: "/settings", label: "Settings", icon: Settings },
];

function initialOf(name: string) {
  return (name.trim()[0] || "S").toUpperCase();
}

export function Sidebar() {
  const { player, signOut } = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed, hydrated } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isParent = player.role === "parent";
  const links = isParent ? PARENT_LINKS : APP_LINKS;
  const showTierSwitcher = process.env.NODE_ENV === "development";

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const handleSignOut = () => {
    signOut();
    router.push("/");
    setMobileOpen(false);
  };

  const profileBody = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-grass text-xs font-semibold text-on-primary">
        {initialOf(player.name)}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium text-ink">
            {player.name || "Your account"}
          </span>
          <span className="block truncate text-xs text-stone-light">
            {isParent ? "Parent" : "Player"}
          </span>
        </span>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r-[0.5px] border-line bg-card shadow-soft transition-[width] duration-300 ease-out lg:flex",
          collapsed ? "w-[76px]" : "w-[248px]",
          !hydrated && "duration-0"
        )}
      >
        <div
          className={cn(
            "group/header flex h-16 shrink-0 items-center gap-2 border-b-[0.5px] border-line px-4",
            collapsed && "justify-center px-0"
          )}
        >
          <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-tennis ring-1 ring-grass/15" />
            {!collapsed && (
              <span className="truncate font-serif text-[22px] italic leading-none text-grass">Seeded</span>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-stone-light opacity-0 transition-opacity duration-150 hover:bg-grass-50 hover:text-ink group-hover/header:opacity-100"
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="flex shrink-0 justify-center pt-3">
            <button
              onClick={toggleCollapsed}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-light transition-colors hover:bg-grass-50 hover:text-ink"
              aria-label="Expand sidebar"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/*
          min-h-0 overrides the flex item's default min-height (content
          height, i.e. "never shrink below what's inside me") — without it,
          a long link list grows the nav past its allotted flex-1 space
          instead of scrolling internally, pushing the pinned section below
          (theme toggle, sign out) off the bottom of the fixed-height aside.
        */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {links.map((l) => {
            const Icon = l.icon;
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 text-sm font-medium transition-colors duration-150",
                  active ? "text-on-primary" : "text-stone hover:text-ink",
                  collapsed && "justify-center pl-0 pr-0"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-xl bg-grass shadow-glow"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                {!active && (
                  <span className="absolute inset-0 rounded-xl bg-grass-50 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                )}
                <span
                  className={cn(
                    "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                    active ? "bg-white/15" : "bg-grass-50 group-hover:bg-grass-100"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[16px] w-[16px] shrink-0 transition-transform duration-200",
                      !active && "group-hover:scale-110"
                    )}
                  />
                </span>
                {!collapsed && <span className="relative z-10 truncate">{l.label}</span>}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg border-[0.5px] border-line bg-card px-2.5 py-1.5 text-xs font-medium text-ink opacity-0 shadow-lift transition-opacity duration-150 group-hover:opacity-100">
                    {l.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn("shrink-0 space-y-1 border-t-[0.5px] border-line p-3", collapsed && "px-2")}>
          {showTierSwitcher && !collapsed && <TierSwitcher className="px-0 pb-1" />}
          <DarkModeToggle
            showLabel={!collapsed}
            // DarkModeToggle's icon-only variant already renders a correctly
            // centered 44x44 button (flex/w-11/items-center/justify-center
            // are baked into its base classes) — the only thing needed here
            // is to center THAT button within the collapsed rail. Overriding
            // width (previously "w-auto") replaced the fixed w-11 via the
            // cn()/tailwind-merge className merge, shrinking the tap target
            // down to the bare icon's ~16px intrinsic width.
            className={collapsed ? "mx-auto" : undefined}
          />

          <div className="pt-1" />

          {isParent ? (
            <div className={cn("flex items-center gap-2.5 rounded-xl p-1.5", collapsed && "justify-center px-0")}>
              {profileBody}
            </div>
          ) : (
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-grass-50",
                collapsed && "justify-center px-0"
              )}
            >
              {profileBody}
            </Link>
          )}

          <button
            onClick={handleSignOut}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-xs text-stone-light transition-colors hover:text-ink",
              collapsed && "justify-center px-0"
            )}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-[0.5px] border-line bg-cream px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-tennis ring-1 ring-grass/15" />
          <span className="font-serif text-[20px] italic leading-none text-grass">Seeded</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-grass-50"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-ink/40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-card shadow-lift lg:hidden"
            >
              <div className="flex h-16 items-center justify-between border-b-[0.5px] border-line px-4">
                <span className="font-serif text-[22px] italic leading-none text-grass">Seeded</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-stone transition-colors hover:bg-grass-50 hover:text-ink"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                {links.map((l) => {
                  const Icon = l.icon;
                  const active = isActive(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl py-2 pl-1.5 pr-3 text-sm font-medium transition-colors",
                        active ? "bg-grass text-on-primary" : "text-stone hover:bg-grass-50 hover:text-ink"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-white/15" : "bg-grass-50"
                        )}
                      >
                        <Icon className="h-[16px] w-[16px] shrink-0" />
                      </span>
                      {l.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="shrink-0 space-y-1 border-t-[0.5px] border-line p-3">
                {showTierSwitcher && <TierSwitcher />}
                <DarkModeToggle showLabel />
                <div className="pt-1" />
                {isParent ? (
                  <div className="flex items-center gap-2.5 rounded-xl p-1.5">{profileBody}</div>
                ) : (
                  <Link
                    href="/settings"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-grass-50"
                  >
                    {profileBody}
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-xs text-stone-light transition-colors hover:text-ink"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                  Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
