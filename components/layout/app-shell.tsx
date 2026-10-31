"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
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
        {/*
          AnimatePresence used to wrap this in an exit animation (mode="wait"
          forced every nav to sit through the OLD page's exit before the NEW
          one could mount — laggy). Removing "wait" fixed the lag but
          introduced a worse bug: with both the exiting and entering page in
          normal document flow at once, the old (now invisible but still
          laid-out) page sat ABOVE the new one, so every navigation landed
          scrolled to the bottom of a doubled-up page — "nothing loaded"
          until you scrolled past the invisible old content to find it.
          A plain CSS fade-in on mount (key={pathname} forces a fresh mount
          per route) gets the same instant feel with no second page ever
          sharing the layout.
        */}
        <div key={pathname} className="animate-fade-in">{children}</div>
      </main>
    </>
  );
}
