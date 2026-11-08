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
  Search,
  Settings,
  Trophy,
  Users,
  X,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { useSidebar } from "@/lib/context/sidebar-context";
import { TierSwitcher } from "@/components/layout/tier-switcher";
import { DarkModeToggle } from "@/components/shared/dark-mode-toggle";
import { GlowOrb } from "@/components/shared/glow-orb";
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

// Same collapse/mobile-drawer/active-route behavior as Legacy's Sidebar
// (components/layout/sidebar.tsx) — only the visual language differs: a
// glass panel instead of a flat card, and the active pill is the Seeded
// accent gradient instead of a flat fill.
export function SeededSidebar() {
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
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-seeded text-xs font-semibold text-white"
        style={{ background: "var(--s-accent-gradient)" }}
      >
        {initialOf(player.name)}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-seeded text-sm font-medium text-ink">
            {player.name || "Your account"}
          </span>
          <span className="block truncate font-seeded text-xs text-stone-light">
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
          "seeded-glass fixed inset-y-0 left-0 z-40 hidden flex-col transition-[width,background-color,border-color,box-shadow] duration-300 ease-out lg:flex",
          collapsed ? "w-[76px]" : "w-[248px]",
          !hydrated && "duration-0"
        )}
        style={{ boxShadow: "var(--s-elevation-1)" }}
      >
        <div className="relative shrink-0 overflow-hidden">
          <GlowOrb className="-left-10 -top-16 h-32 w-32 opacity-70" />
          <div
            className={cn(
              "group/header relative flex h-16 items-center gap-2 border-b border-[rgb(var(--c-line))] px-4",
              collapsed && "justify-center px-0"
            )}
          >
          <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
              <span
                className="absolute inset-0 rounded-full opacity-40 blur-[6px]"
                style={{ background: "var(--s-accent-gradient)" }}
              />
              <span
                className="relative h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--s-accent-gradient)" }}
              />
            </span>
            {!collapsed && (
              <span className="truncate font-seeded text-lg font-semibold tracking-tight text-ink">
                Seeded
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-transparent text-stone-light opacity-0 transition-opacity duration-150 hover:border-[rgb(var(--c-line))] hover:bg-[rgb(var(--c-primary)/0.08)] hover:text-ink group-hover/header:opacity-100"
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
          </div>
        </div>

        {collapsed && (
          <div className="flex shrink-0 justify-center pt-3">
            <button
              onClick={toggleCollapsed}
              className="flex h-7 w-7 items-center justify-center rounded-lg border-[1.5px] border-transparent text-stone-light transition-colors hover:border-[rgb(var(--c-line))] hover:bg-[rgb(var(--c-primary)/0.08)] hover:text-ink"
              aria-label="Expand sidebar"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className={cn("shrink-0 px-3 pt-3", collapsed && "px-2")}>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border border-[rgb(var(--c-line))] bg-[rgb(var(--c-primary)/0.03)] px-3 py-2 font-seeded text-sm text-stone-light transition-colors hover:border-[rgb(var(--c-primary)/0.3)] hover:text-ink",
              collapsed && "justify-center px-0"
            )}
            aria-label="Open command palette"
          >
            <Search className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Jump to…</span>
                <kbd className="rounded border border-[rgb(var(--c-line))] px-1.5 py-0.5 font-mono text-[10px]">
                  ⌘K
                </kbd>
              </>
            )}
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
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 font-seeded text-sm font-medium transition-colors duration-150",
                  active ? "text-on-primary" : "text-stone hover:text-ink",
                  collapsed && "justify-center pl-0 pr-0"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="seeded-sidebar-active-pill"
                    className="absolute inset-0 rounded-xl shadow-seeded-1"
                    style={{ background: "var(--s-accent-gradient)" }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                {!active && (
                  <span className="absolute inset-0 rounded-xl bg-[rgb(var(--c-primary)/0.08)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                )}
                <span
                  className={cn(
                    "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                    active ? "bg-white/15" : "bg-[rgb(var(--c-primary)/0.07)] group-hover:bg-[rgb(var(--c-primary)/0.12)]"
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
                  <span className="seeded-glass pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-seeded text-xs font-medium text-ink opacity-0 shadow-seeded-1 transition-opacity duration-150 group-hover:opacity-100">
                    {l.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn("shrink-0 space-y-1 border-t border-[rgb(var(--c-line))] p-3", collapsed && "px-2")}>
          {showTierSwitcher && !collapsed && <TierSwitcher className="px-0 pb-1" />}
          <DarkModeToggle showLabel={!collapsed} className={collapsed ? "mx-auto" : undefined} />

          <div className="pt-1" />

          {isParent ? (
            <div className={cn("flex items-center gap-2.5 rounded-xl p-1.5", collapsed && "justify-center px-0")}>
              {profileBody}
            </div>
          ) : (
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-[rgb(var(--c-primary)/0.08)]",
                collapsed && "justify-center px-0"
              )}
            >
              {profileBody}
            </Link>
          )}

          <button
            onClick={handleSignOut}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border-[1.5px] border-transparent px-1.5 py-1.5 font-seeded text-xs text-stone-light transition-colors hover:border-[rgb(var(--c-line))] hover:text-ink",
              collapsed && "justify-center px-0"
            )}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="seeded-glass sticky top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--s-accent-gradient)" }} />
          <span className="font-seeded text-lg font-semibold tracking-tight text-ink">Seeded</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-transparent text-ink transition-colors hover:border-[rgb(var(--c-line))]"
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
              className="seeded-glass fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col shadow-seeded-2 lg:hidden"
            >
              <div className="flex h-16 items-center justify-between border-b border-[rgb(var(--c-line))] px-4">
                <span className="font-seeded text-lg font-semibold tracking-tight text-ink">Seeded</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-transparent text-stone transition-colors hover:border-[rgb(var(--c-line))] hover:text-ink"
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
                        "flex items-center gap-2.5 rounded-xl py-2 pl-1.5 pr-3 font-seeded text-sm font-medium transition-colors",
                        active ? "text-on-primary" : "text-stone hover:text-ink"
                      )}
                      style={active ? { background: "var(--s-accent-gradient)" } : undefined}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-white/15" : "bg-[rgb(var(--c-primary)/0.07)]"
                        )}
                      >
                        <Icon className="h-[16px] w-[16px] shrink-0" />
                      </span>
                      {l.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="shrink-0 space-y-1 border-t border-[rgb(var(--c-line))] p-3">
                {showTierSwitcher && <TierSwitcher />}
                <DarkModeToggle showLabel />
                <div className="pt-1" />
                {isParent ? (
                  <div className="flex items-center gap-2.5 rounded-xl p-1.5">{profileBody}</div>
                ) : (
                  <Link
                    href="/settings"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-[rgb(var(--c-primary)/0.08)]"
                  >
                    {profileBody}
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl border-[1.5px] border-transparent px-1.5 py-1.5 font-seeded text-xs text-stone-light transition-colors hover:border-[rgb(var(--c-line))] hover:text-ink"
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
