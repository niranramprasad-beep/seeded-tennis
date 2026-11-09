"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Clock,
  Compass,
  Mail,
  School,
  Search,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { cn } from "@/lib/utils";

interface Command {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords?: string;
}

// Mirrors the Phase 3 sidebar's PLAYER_NAV_LINKS/PARENT_NAV_LINKS exactly —
// keep both in sync.
const PLAYER_COMMANDS: Command[] = [
  { label: "Today", href: "/today", icon: Clock },
  { label: "Plan", href: "/plan", icon: TrendingUp, keywords: "roadmap checkpoints" },
  { label: "Schools", href: "/schools", icon: School, keywords: "browse programs" },
  { label: "Outreach", href: "/outreach", icon: Mail, keywords: "coaches email" },
  { label: "Events", href: "/events", icon: CalendarDays, keywords: "calendar training matches" },
  { label: "Tournament fit", href: "/tournament-fit", icon: Compass },
];

const PARENT_COMMANDS: Command[] = [
  { label: "Family", href: "/family", icon: Users, keywords: "budget costs" },
  { label: "Schools", href: "/schools", icon: School, keywords: "browse programs" },
  { label: "Tournament fit", href: "/tournament-fit", icon: Compass },
];

const SHARED_COMMANDS: Command[] = [{ label: "Settings", href: "/settings", icon: Settings }];

// Signed-in only — mounted once by AppShell alongside SeededSidebar. Opens
// on Cmd/Ctrl+K from anywhere, fuzzy-filters the same route list the
// sidebar itself shows, and is fully keyboard-navigable.
export function CommandPalette() {
  const { player } = usePlayer();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(() => {
    const roleCommands = player.role === "parent" ? PARENT_COMMANDS : PLAYER_COMMANDS;
    const all = [...roleCommands, ...SHARED_COMMANDS];
    // De-dupe by href (Tournament fit/Schools appear in both role lists).
    return Array.from(new Map(all.map((c) => [c.href, c])).values());
  }, [player.role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Let the opening animation mount before focusing, so the frame
      // doesn't jump.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target) go(target.href);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-ink/50"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="seeded-glass fixed left-1/2 top-[18vh] z-[101] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-[22px] shadow-seeded-3"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b border-[rgb(var(--c-line))] px-4 py-3.5">
              <Search className="h-4 w-4 shrink-0 text-stone-light" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Jump to…"
                className="w-full bg-transparent font-seeded text-sm text-ink placeholder:text-stone-light focus:outline-none"
                aria-label="Search pages"
              />
              <kbd className="shrink-0 rounded-md border border-[rgb(var(--c-line))] px-1.5 py-0.5 font-mono text-[10px] text-stone-light">
                esc
              </kbd>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-stone">No matches.</p>
              )}
              {filtered.map((c, i) => (
                <button
                  key={c.href}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(c.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left font-seeded text-sm transition-colors",
                    i === activeIndex ? "border-transparent text-on-primary" : "border-transparent hover:border-[rgb(var(--c-line))] text-ink"
                  )}
                  style={i === activeIndex ? { background: "var(--s-accent-gradient)" } : undefined}
                >
                  <c.icon className="h-4 w-4 shrink-0" />
                  {c.label}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
