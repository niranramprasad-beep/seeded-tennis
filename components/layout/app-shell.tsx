"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { usePlayer } from "@/lib/context/player-context";
import { useSidebar } from "@/lib/context/sidebar-context";
import { Nav } from "./nav";
import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";

// Signed-out visitors (and anyone on a marketing page before hydration
// resolves) get the top marketing header. Signed-in users get the app
// shell's left sidebar instead, on every route — same split the old Nav
// component made internally via `showApp`, just now as two components.
//
// The <main> wrapper around `{children}` must keep the SAME shape in both
// branches. Flows like signup's "create a family" step flip `isAuthed` to
// true without navigating away (it shows a success screen in place) — if
// the wrapper structure differed here, that transition would unmount and
// remount the page, silently wiping its local state.
export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthed, hydrated } = usePlayer();
  const { collapsed, hydrated: sidebarHydrated } = useSidebar();
  const pathname = usePathname();
  const showApp = hydrated && isAuthed;

  return (
    <>
      {showApp ? <Sidebar /> : <Nav />}
      <main
        className={cn(
          showApp && [
            "min-h-screen transition-[margin-left] duration-300 ease-out",
            collapsed ? "lg:ml-[76px]" : "lg:ml-[248px]",
            !sidebarHydrated && "duration-0",
          ]
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  );
}
