"use client";

import { Suspense, useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/lib/context/player-context";
import { useSidebar } from "@/lib/context/sidebar-context";
import { useDesign } from "@/lib/context/design-context";
import { Nav } from "./nav";
import { Sidebar } from "./sidebar";
import { SeededNav } from "@/components/seeded/layout/nav";
import { SeededSidebar } from "@/components/seeded/layout/sidebar";
import { CommandPalette } from "@/components/seeded/shared/command-palette";
import { CheckoutSync } from "@/components/shared/checkout-sync";
import { AccountDeletedNotice } from "@/components/shared/account-deleted-notice";
import { cn } from "@/lib/utils";
import { isPrivateRoute } from "@/lib/seo/private-routes";

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
// Routes that show the PUBLIC nav to a signed-out visitor: everything that is
// not part of the signed-in app. /auth/*, /reset-password and unknown paths
// (the 404 page) are private for robots.txt but still render the public nav,
// so they also need it before the session check — otherwise they shift by
// the header's height on load (measured: CLS 0.06 on /auth/callback and the
// 404 page at 375).
const APP_ONLY_PREFIXES = [
  "/today", "/plan", "/outreach", "/events", "/family", "/settings", "/matches",
  "/match-mode", "/dashboard", "/roadmap", "/training", "/coaches", "/cost-calculator",
];
function rendersPublicNavBeforeSession(pathname: string): boolean {
  if (!isPrivateRoute(pathname)) return true;
  return !APP_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthed, hydrated } = usePlayer();
  const { collapsed, hydrated: sidebarHydrated } = useSidebar();
  const { design } = useDesign();
  const isSeeded = design === "seeded";
  const pathname = usePathname();
  const showApp = hydrated && isAuthed;
  // Before the session check, an app route lays out as the app (sidebar
  // margin on desktop) so the page does not slide sideways when it resolves.
  // Before the check, only a browser that holds a saved session lays out as
  // the app — via CSS (html[data-session], see globals.css), since React
  // cannot know yet. A signed-out visitor who opened /today is about to be
  // sent to /login; reserving the sidebar for them shifted the page 0.16.
  const layoutAsApp = showApp;
  const preSessionAppRoute = !hydrated && isSeeded && !rendersPublicNavBeforeSession(pathname);
  // /onboarding and /methodology used to be listed here too, each rendering
  // its own cut-down header instead. That was the mockups' structure, and on
  // a real site it meant the two pages a visitor is most likely to land on
  // from search had no navigation at all: /methodology offered a logo and a
  // CTA and no way to reach Schools or Pricing, and /onboarding's first
  // screen had no <header> element whatsoever — measured, not guessed
  // (docs/screenshots/polish/before.json records NO-HEADER at 375, 1024 and
  // 1440). Both now get the shared SeededNav like every other public page,
  // and their bespoke headers have been removed so nothing stacks.
  //
  // /sample-report keeps its own header on purpose: it is a standalone
  // artefact of what the weekly parent report looks like, and must never
  // read as part of the authenticated app chrome.
  const hideSeededNav = isSeeded && pathname === "/sample-report";
  useScrollToTopOnRouteChange(pathname);

  return (
    <>
      {/* First focusable element on every page: keyboard users skip the
          nav (WCAG 2.4.1). Visible only when focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-card focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-card focus:outline focus:outline-2 focus:outline-lime-accent"
      >
        Skip to content
      </a>
      {hydrated
        ? showApp
          ? isSeeded
            ? (
              <>
                <SeededSidebar />
                <CommandPalette />
              </>
            )
            : <Sidebar />
          : isSeeded
            ? hideSeededNav ? null : <SeededNav />
            : <Nav />
        : // Before the session check resolves, a PUBLIC page renders the
          // public nav straight away. It used to render nothing, so the
          // server HTML had no <header> at all: on hydration a 73px nav
          // appeared above <main> and pushed every public page down — CLS
          // 0.09 at 375px on /, /contact, /methodology (0.05 at 1440), and a
          // crawler that does not run JavaScript saw no site navigation.
          // A signed-in visitor on a public page sees the public nav for
          // the length of the session check before the sidebar replaces it;
          // private routes keep rendering nothing (AuthGate shows its own
          // loading state there).
          // A visitor whose browser holds a saved session (the head script
          // in app/layout.tsx sets html[data-session]) gets the app's frame
          // instead: globals.css hides this nav, shows the 56px mobile bar
          // and gives <main> the sidebar margin. Without that, a signed-in
          // player opening /schools at desktop width watched the page slide
          // 248px sideways when the sidebar arrived (measured CLS 0.21).
          rendersPublicNavBeforeSession(pathname) && isSeeded && !hideSeededNav
          ? (
            <>
              <div className="pre-session-public-nav"><SeededNav /></div>
              <div className="pre-session-app-bar hidden h-14 border-b border-[rgb(var(--c-line))] bg-panel" aria-hidden />
            </>
          )
          : preSessionAppRoute
            // An app route: a browser with a saved session gets the
            // sidebar's 56px mobile bar (or the desktop margin) — measured
            // CLS 0.069 on /today at 375 without it. One without is about to
            // be sent to /login, so it gets /login's public header instead
            // (reserving the app frame for it shifted the page 0.09–0.16).
            ? (
              <>
                <div className="pre-session-public-nav"><SeededNav /></div>
                <div className="pre-session-app-bar hidden h-14 border-b border-[rgb(var(--c-line))] bg-panel" aria-hidden />
              </>
            )
            : null}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "focus:outline-none",
          ((!hydrated && isSeeded && rendersPublicNavBeforeSession(pathname)) || preSessionAppRoute) && "pre-session-main",
          preSessionAppRoute && "min-h-screen",
          layoutAsApp && [
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
        {/* Post-checkout safety net. Mounted here, above every page, rather
            than on the checkout redirect target: `?checkout=success` lands on
            /dashboard, which immediately redirects, and a shared or
            bookmarked return URL could be any route. Renders nothing unless
            that param is present. */}
        <Suspense fallback={null}>
          <CheckoutSync />
          <AccountDeletedNotice />
        </Suspense>
        <div key={pathname} className="animate-fade-in">{children}</div>
      </main>
    </>
  );
}
