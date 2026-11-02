"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/lib/context/player-context";
import { useSidebar } from "@/lib/context/sidebar-context";
import { useDesign } from "@/lib/context/design-context";
import { Nav } from "./nav";
import { Sidebar } from "./sidebar";
import { PremiumNav } from "@/components/premium/layout/nav";
import { PremiumSidebar } from "@/components/premium/layout/sidebar";
import { cn } from "@/lib/utils";

// Link/sidebar navigation already lands at the top (Next's default), but
// browser back/forward tries to RESTORE the scroll position you left a page
// at — standard browser behavior, but this app wants every route change,
// back/forward included, to always open at the top. A second rAF-deferred
// call covers Next's own restoration attempt landing after this effect.
function useScrollToTopOnRouteChange(pathname: string) {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const raf = requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);
}

// Signed-out visitors get the top marketing header, signed-in users get the
// app shell's left sidebar instead, on every route — same split the old Nav
// component made internally via `showApp`, just now as two components.
//
// While session hydration is still in flight (e.g. a hard navigation
// straight to an authenticated route like /roadmap, which has to wait on a
// real round-trip to confirm the session), `isAuthed` briefly reads false
// even for an already-signed-in user. Rendering neither header during that
// window avoids flashing the marketing "Sign in / Request access" header at
// a signed-in user — which looked like their session had been lost.
//
// The <main> wrapper around `{children}` must keep the SAME shape across all
// three states. Flows like signup's "create a family" step flip `isAuthed`
// to true without navigating away (it shows a success screen in place) — if
// the wrapper structure differed here, that transition would unmount and
// remount the page, silently wiping its local state.
export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthed, hydrated } = usePlayer();
  const { collapsed, hydrated: sidebarHydrated } = useSidebar();
  const { design } = useDesign();
  const isPremium = design === "premium";
  const pathname = usePathname();
  const showApp = hydrated && isAuthed;
  useScrollToTopOnRouteChange(pathname);

  return (
    <>
      {hydrated
        ? showApp
          ? isPremium
            ? <PremiumSidebar />
            : <Sidebar />
          : isPremium
            ? <PremiumNav />
            : <Nav />
        : null}
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
