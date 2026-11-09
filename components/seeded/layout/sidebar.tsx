"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Compass,
  LogOut,
  Mail,
  School,
  Search,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { useSidebar } from "@/lib/context/sidebar-context";
import { DarkModeToggle } from "@/components/shared/dark-mode-toggle";
import { getSchoolsLite } from "@/lib/data";
import { loadCoachOutreachDated } from "@/lib/supabase/features";
import { buildTodayActions } from "@/lib/today-actions";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon; badge?: number };

// Real count of /today's action list, computed the same way
// seeded-dashboard-layout.tsx does — so the sidebar badge never disagrees
// with what /today actually shows. Cheap: getSchoolsLite() is in-memory, and
// SWR dedupes the "coach-outreach-dated"/"schools-lite" keys against any
// other component requesting the same data (e.g. /today itself, when both
// are mounted together).
function useTodayActionCount(targetSchoolSlugs: string[], playerUtr: number): number {
  const { data: schools } = useSWR("schools-lite", () => getSchoolsLite());
  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());
  return useMemo(() => {
    if (!schools) return 0;
    const targetSchools = schools.filter((s) => targetSchoolSlugs.includes(s.slug));
    return buildTodayActions(playerUtr, targetSchools, outreach ?? {}).length;
  }, [schools, outreach, targetSchoolSlugs, playerUtr]);
}

// The redesign's 5-item IA (Today.dc.html / MobileToday.dc.html) is
// player-only — every one of the 11 mockups shows the player's view.
// Settings moves to the avatar menu below, and Tournament fit (which the
// mockups don't give a nav slot) lives there too rather than being dropped
// with no way to reach it.
const PLAYER_NAV_LINKS: NavLink[] = [
  { href: "/today", label: "Today", icon: Clock },
  { href: "/plan", label: "Plan", icon: TrendingUp },
  { href: "/schools", label: "Schools", icon: School },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/events", label: "Events", icon: CalendarDays },
];

// No mockup covers the parent role. AuthGate's isParentAllowedPath only
// permits /family, /settings, /cost-calculator (Legacy) and /tournament-fit
// — showing the player's Today/Plan/Outreach/Events links to a parent would
// just bounce them straight back out. Family now carries its own Budget tab
// (see parent-dashboard-view.tsx), so the parent's real top-level nav is
// just these two; Settings/Tournament fit stay in the avatar menu for both
// roles.
const PARENT_NAV_LINKS: NavLink[] = [
  { href: "/family", label: "Family", icon: Users },
  { href: "/schools", label: "Schools", icon: School },
];

function initialOf(name: string) {
  return (name.trim()[0] || "S").toUpperCase();
}

// Pixel-exact to Today.dc.html's sidebar: fixed 232px flat panel (not
// glass), active item = solid grass-50 pill + grass text (.nav-on), plus a
// bottom tab bar on mobile (MobileToday.dc.html) replacing the old slide-in
// drawer. Settings/Family/Tournament fit/Sign out live behind the profile
// block's avatar menu — the mockup shows that block as static text, but the
// phase spec explicitly needs those reachable from somewhere, and a static
// screenshot can't depict an interactive menu.
export function SeededSidebar() {
  const { player, signOut } = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed, hydrated } = useSidebar();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);

  const isParent = player.role === "parent";
  const todayCount = useTodayActionCount(player.targetSchoolSlugs, player.currentUTR);
  const navLinks = useMemo(() => {
    const base = isParent ? PARENT_NAV_LINKS : PLAYER_NAV_LINKS;
    if (isParent || todayCount === 0) return base;
    return base.map((l) => (l.href === "/today" ? { ...l, badge: todayCount } : l));
  }, [isParent, todayCount]);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const handleSignOut = () => {
    signOut();
    router.push("/");
    setMobileMenuOpen(false);
    setDesktopMenuOpen(false);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[rgb(var(--c-line))] bg-[#FBFAF7] transition-[width] duration-300 ease-out lg:flex",
          collapsed ? "w-[76px]" : "w-[232px]",
          !hydrated && "duration-0"
        )}
      >
        <div
          className={cn(
            "group/header flex h-16 shrink-0 items-center gap-2 border-b border-[rgb(var(--c-line))] px-4",
            collapsed && "justify-center px-0"
          )}
        >
          <Link href="/today" className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-lime-accent ring-1 ring-ink" />
            {!collapsed && (
              <span className="truncate font-seeded text-lg font-semibold tracking-tight text-ink">
                Seeded
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-transparent text-stone-light opacity-0 transition-opacity duration-150 hover:border-[rgb(var(--c-line))] hover:text-ink group-hover/header:opacity-100"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg border-[1.5px] border-transparent text-stone-light transition-colors hover:border-[rgb(var(--c-line))] hover:text-ink"
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
              "flex w-full items-center gap-2.5 rounded-lg border border-[rgb(var(--c-line))] bg-card px-3 py-2 font-sans text-sm text-stone-light transition-colors hover:border-grass/40 hover:text-ink",
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

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="App">
          {navLinks.map((l) => {
            const Icon = l.icon;
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 rounded-lg px-3 font-sans text-[15px] transition-colors",
                  active ? "bg-grass-50 font-semibold text-grass" : "text-ink hover:bg-[rgb(var(--c-primary)/0.06)]",
                  collapsed && "justify-center px-0"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{l.label}</span>}
                {!collapsed && !!l.badge && (
                  <span className="ml-auto rounded-pill bg-lime-accent px-[7px] py-px text-xs font-semibold text-ink">
                    {l.badge}
                  </span>
                )}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg border border-[rgb(var(--c-line))] bg-card px-2.5 py-1.5 font-sans text-xs font-medium text-ink opacity-0 shadow-card transition-opacity duration-150 hover:opacity-100">
                    {l.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn("relative shrink-0 border-t border-[rgb(var(--c-line))] p-3", collapsed && "px-2")}>
          <DarkModeToggle showLabel={!collapsed} className={collapsed ? "mx-auto mb-1" : "mb-1"} />
          <SeededAvatarMenu
            player={player}
            isParent={isParent}
            collapsed={collapsed}
            open={desktopMenuOpen}
            onOpenChange={setDesktopMenuOpen}
            onSignOut={handleSignOut}
          />
        </div>
      </aside>

      {/* Mobile top bar — avatar menu only, nav itself is the bottom tab bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[rgb(var(--c-line))] bg-[#FBFAF7] px-4 lg:hidden">
        <Link href="/today" className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-lime-accent ring-1 ring-ink" />
          <span className="font-seeded text-lg font-semibold tracking-tight text-ink">Seeded</span>
        </Link>
        <SeededAvatarTrigger
          player={player}
          open={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
        />
        <AnimatePresence>
          {mobileMenuOpen && (
            <SeededAvatarPanel
              align="right"
              onClose={() => setMobileMenuOpen(false)}
              onSignOut={handleSignOut}
            />
          )}
        </AnimatePresence>
      </header>

      {/* Mobile bottom tab bar — pixel-exact to MobileToday.dc.html */}
      <nav
        aria-label="App"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[rgb(var(--c-line))] bg-card px-1 pt-1 lg:hidden"
        style={{ paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}
      >
        {navLinks.map((l) => {
          const active = isActive(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-[3px] text-[11px]",
                active ? "font-semibold text-grass" : "text-stone"
              )}
            >
              {/* Pixel-exact hand-drawn icons for the player's mockup-defined
                  5 items; parent mode has no mockup, so it falls back to the
                  same lucide icon used in the desktop nav. */}
              <span className="relative">
                {isParent ? <Icon className="h-[22px] w-[22px]" aria-hidden /> : <TabIcon href={l.href} />}
                {!!l.badge && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-lime-accent px-1 text-[10px] font-semibold text-ink">
                    {l.badge}
                  </span>
                )}
              </span>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

// Inline SVGs copied exactly from MobileToday.dc.html — the mockup draws
// each tab icon by hand rather than using a stock icon set, so these match
// pixel-for-pixel instead of substituting the nearest lucide equivalent.
function TabIcon({ href }: { href: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 22 22",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    "aria-hidden": true,
  } as const;

  switch (href) {
    case "/today":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="8" />
          <path d="M11 6v5l3 2" />
        </svg>
      );
    case "/plan":
      return (
        <svg {...common}>
          <path d="M3 18l5-6 4 3 7-9" />
        </svg>
      );
    case "/schools":
      return (
        <svg {...common}>
          <path d="M3 9l8-5 8 5M5 9v8h12V9" />
        </svg>
      );
    case "/outreach":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="16" height="12" rx="2" />
          <path d="M3 7l8 5 8-5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="5" width="16" height="14" rx="2" />
          <path d="M3 9h16M8 3v4M14 3v4" />
        </svg>
      );
  }
}

interface AvatarPlayer {
  name: string;
}

function SeededAvatarTrigger({
  player,
  open,
  onClick,
}: {
  player: AvatarPlayer;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      aria-label="Account menu"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-grass-50 font-sans text-xs font-semibold text-grass"
    >
      {initialOf(player.name)}
    </button>
  );
}

// Desktop: the full profile row (avatar + name/role) is itself the trigger,
// expanding a menu above it so it never runs off the bottom of the
// viewport.
function SeededAvatarMenu({
  player,
  isParent,
  collapsed,
  open,
  onOpenChange,
  onSignOut,
}: {
  player: AvatarPlayer & { role?: string };
  isParent: boolean;
  collapsed: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSignOut: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-[rgb(var(--c-primary)/0.06)]",
          collapsed && "justify-center px-0"
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-grass-50 font-sans text-xs font-semibold text-grass">
          {initialOf(player.name)}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate font-sans text-sm font-medium text-ink">
                {player.name || "Your account"}
              </span>
              <span className="block truncate font-sans text-xs text-stone-light">
                {isParent ? "Parent" : "Player"}
              </span>
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-stone-light transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>
      <AnimatePresence>
        {open && <SeededAvatarPanel align="left" onClose={() => onOpenChange(false)} onSignOut={onSignOut} />}
      </AnimatePresence>
    </div>
  );
}

function SeededAvatarPanel({
  align,
  onClose,
  onSignOut,
}: {
  align: "left" | "right";
  onClose: () => void;
  onSignOut: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.12 }}
      className={cn(
        "absolute bottom-full z-50 mb-2 w-52 overflow-hidden rounded-lg border border-[rgb(var(--c-line))] bg-card p-1.5 shadow-card",
        align === "left" ? "left-0" : "right-0 top-full bottom-auto mb-0 mt-2"
      )}
    >
      <PanelLink href="/tournament-fit" icon={Compass} onClick={onClose}>
        Tournament fit
      </PanelLink>
      <PanelLink href="/settings" icon={Settings} onClick={onClose}>
        Settings
      </PanelLink>
      <button
        onClick={onSignOut}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 font-sans text-sm text-stone transition-colors hover:bg-[rgb(var(--c-primary)/0.06)] hover:text-ink"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Sign out
      </button>
    </motion.div>
  );
}

function PanelLink({
  href,
  icon: Icon,
  onClick,
  children,
}: {
  href: string;
  icon: LucideIcon;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 font-sans text-sm text-ink transition-colors hover:bg-[rgb(var(--c-primary)/0.06)]"
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </Link>
  );
}
