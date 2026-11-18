"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePlayer } from "@/lib/context/player-context";
import { useDialog } from "@/lib/hooks/use-dialog";
import { cn } from "@/lib/utils";
import {
  PARENT_NAV_LINKS,
  PARENT_TOOL_LINKS,
  PLAYER_NAV_LINKS,
  PLAYER_TOOL_LINKS,
  SETTINGS_LINK,
  type NavLink,
} from "@/components/seeded/layout/nav-links";

interface Command {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords?: string;
}

// Built from the same lists the sidebar renders (nav-links.ts). These were
// two hand-kept copies "kept in sync" by a comment, and they were not: the
// parent copy still offered Events after the sidebar dropped it.
const toCommand = (l: NavLink): Command => ({ label: l.label, href: l.href, icon: l.icon, keywords: l.keywords });
// The sidebar's two groups, in order: the five, then Tools (Results, the
// tournament checker).
const PLAYER_COMMANDS: Command[] = [...PLAYER_NAV_LINKS, ...PLAYER_TOOL_LINKS].map(toCommand);
const PARENT_COMMANDS: Command[] = [...PARENT_NAV_LINKS, ...PARENT_TOOL_LINKS].map(toCommand);

const SHARED_COMMANDS: Command[] = [toCommand(SETTINGS_LINK)];

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
  // Esc, focus trap, focus return and scroll lock (lib/hooks/use-dialog.ts).
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(open, () => setOpen(false), panelRef);

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
            // Black in both themes — `bg-ink/50` was a light-grey wash in
            // dark mode, where ink is the light text colour.
            className="fixed inset-0 z-[100] bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="pointer-events-none fixed inset-x-0 top-[18vh] z-[101] flex justify-center px-4">
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-xl border border-line bg-card shadow-card"
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
                className="w-full bg-transparent text-base text-ink placeholder:text-stone-light focus:outline-none sm:text-sm"
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
                  // The highlighted row is the sidebar's active style, not the
                  // old accent gradient (design system v2, sweep C17).
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors",
                    i === activeIndex ? "bg-grass-50 font-semibold text-grass" : "text-ink"
                  )}
                >
                  <c.icon className="h-4 w-4 shrink-0" />
                  {c.label}
                </button>
              ))}
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
