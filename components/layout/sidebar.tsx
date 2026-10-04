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

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r-[0.5px] border-line bg-card transition-[width] duration-300 ease-out lg:flex",
          collapsed ? "w-[76px]" : "w-[248px]",
          !hydrated && "duration-0"
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center gap-2 border-b-[0.5px] border-line px-4",
            collapsed && "justify-center px-0"
          )}
        >
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-tennis ring-1 ring-grass/15" />
            {!collapsed && (
              <span className="font-serif text-[22px] italic leading-none text-grass">Seeded</span>
            )}
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {links.map((l) => {
            const Icon = l.icon;
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active ? "text-on-primary" : "text-stone hover:text-ink",
                  collapsed && "justify-center px-0"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-xl bg-grass shadow-soft"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative z-10 h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                    !active && "group-hover:scale-110 group-hover:-translate-y-0.5"
                  )}
                />
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

        <div className={cn("space-y-2 border-t-[0.5px] border-line p-3", collapsed && "px-2")}>
          {showTierSwitcher && !collapsed && <TierSwitcher className="px-0" />}
          <DarkModeToggle
            showLabel={!collapsed}
            className={collapsed ? "mx-auto flex w-auto justify-center px-0" : undefined}
          />
          {!isParent && (
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink",
                collapsed && "justify-center px-0"
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              {!collapsed && "Settings"}
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink",
              collapsed && "justify-center px-0"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && "Sign out"}
          </button>
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-stone-light transition-colors hover:bg-grass-50 hover:text-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-[0.5px] border-line bg-cream/90 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-tennis ring-1 ring-grass/15" />
          <span className="font-serif text-[20px] italic leading-none text-grass">Seeded</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-grass-50"
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
                  className="flex h-9 w-9 items-center justify-center rounded-full text-stone transition-colors hover:bg-grass-50 hover:text-ink"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {links.map((l) => {
                  const Icon = l.icon;
                  const active = isActive(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                        active ? "bg-grass text-on-primary" : "text-stone hover:bg-grass-50 hover:text-ink"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {l.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="space-y-2 border-t-[0.5px] border-line p-3">
                {showTierSwitcher && <TierSwitcher />}
                <DarkModeToggle showLabel />
                {!isParent && (
                  <Link
                    href="/settings"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-stone transition-colors hover:bg-grass-50 hover:text-ink"
                >
                  <LogOut className="h-4 w-4" />
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
