"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { SeededMark } from "@/components/seeded/icons";
import { Drawer } from "@/components/ui/drawer";
import { activeNavHref } from "@/lib/nav-active";

type NavLink = { href: string; label: string };

// Pixel-exact to Main.dc.html's nav: "Fit report"/"Tournament checker" both
// point at the fit-report flow and the dedicated tournament checker —
// Main.dc.html itself links every non-CTA nav item to "#" (a mockup
// placeholder, not a real destination), so these are mapped to the closest
// real route rather than copied literally.
const MARKETING_LINKS: NavLink[] = [
  { href: "/onboarding", label: "Fit report" },
  { href: "/tournament-fit", label: "Tournament checker" },
  { href: "/schools", label: "Schools" },
  { href: "/sample-report", label: "For parents" },
  { href: "/pricing", label: "Pricing" },
];

// Plain static header (no fixed-over-hero/scroll-shrink/glass backdrop) —
// every one of the 11 mockups shows a simple bordered top bar in normal
// document flow, not the ambient floating nav the old Seeded design used.
//
// THE HEADER USED TO WRAP TO TWO ROWS AT EVERY DESKTOP WIDTH, and the cause
// was not "not enough room". The nav had `flex-wrap`, and TWO `flex-1`
// children: the links list and an empty `aria-hidden` spacer div. Two equal
// flex-1 siblings split the free space 50/50, so the links were handed
// exactly half of it — measured at 1440px: a 360px box holding ~480px of
// links, next to a 360px box holding nothing. `flex-wrap` then did the
// obvious thing and dropped "For parents" and "Pricing" onto a second row,
// making the header 94px tall instead of 65px on six pages.
//
// So: the spacer is gone, `flex-wrap` is gone, every link is
// `whitespace-nowrap`, and the end group is `shrink-0` so the links shrink
// before Sign in ever does. There is a measured regression test
// for this — scripts/ui-audit.mjs records `distinctTops` and header height
// per width, and docs/screenshots/polish/after.json is the record.
// Board 21: the sign-in / sign-up / reset screens get a slim header with the
// logo only — the marketing links and the green Sign in would compete with
// the one primary button on the card.
const LOGO_ONLY_ROUTES = ["/login", "/signup", "/reset-password", "/parent-login", "/parent-signup", "/auth/complete", "/auth/callback"];

// 23 Nov consult (Herdy + Niran): "Fit report" in the links and the green
// "Get my free fit report" button went to the same page, so the button is
// gone and Sign in is the header's green button. On /onboarding a green Sign
// in would be a second green button beside the diagnostic's Continue (rule
// 1), so it stays a plain link there; "Fit report" keeps aria-current.
const PLAIN_SIGN_IN_ROUTES = ["/onboarding"];

// Where the links move into the header (Tailwind `lg`).
const DESKTOP_QUERY = "(min-width: 1024px)";

function SeededLogo() {
  return (
    <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 font-seeded text-xl font-bold text-ink">
      {/* The one mark (components/seeded/icons), same as the sidebar and footer. */}
      <SeededMark size={22} className="shrink-0" />
      Seeded
    </Link>
  );
}

export function SeededNav() {
  const pathname = usePathname();
  // The phone menu remembers the page it was opened on, so ANY route change
  // closes it: one of its own links, back/forward, or a link on the page.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn !== null && menuOpenOn === pathname;
  const closeMenu = () => setMenuOpenOn(null);

  // It also closes when the window widens to desktop, where the button that
  // opened it is hidden and the links are back in the header.
  useEffect(() => {
    if (!menuOpen) return;
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (desktop.matches) setMenuOpenOn(null);
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [menuOpen]);

  // lib/nav-active.ts: the same "current page" rule as the app sidebar.
  const activeHref = activeNavHref(pathname, MARKETING_LINKS.map((l) => l.href));
  const isActive = (href: string) => href === activeHref;
  const greenSignIn = !PLAIN_SIGN_IN_ROUTES.includes(pathname);

  if (LOGO_ONLY_ROUTES.includes(pathname)) {
    return (
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-[1200px] items-center px-6 py-3.5">
          <SeededLogo />
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-line bg-cream">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1200px] flex-nowrap items-center gap-5 px-6 py-3.5 xl:gap-6"
      >
        <SeededLogo />

        <div className="hidden min-w-0 flex-1 items-center gap-4 text-[15px] lg:flex xl:gap-5">
          {MARKETING_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={cn(
                "inline-flex min-h-6 items-center whitespace-nowrap text-ink hover:text-grass",
                isActive(l.href) && "font-semibold text-grass"
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden shrink-0 items-center lg:flex">
          <Link
            href="/login"
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap text-[15px]",
              greenSignIn
                ? "min-h-11 rounded-lg bg-grass px-[18px] font-semibold text-on-primary hover:bg-grass-600"
                : "min-h-6 text-ink hover:text-grass"
            )}
          >
            Sign in
          </Link>
        </div>

        <button
          type="button"
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink hover:border-line lg:hidden"
          onClick={() => setMenuOpenOn(pathname)}
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </nav>

      {/* 23 Nov consult: on phones the menu slides in from the right as its
          own panel instead of opening under the header and pushing the page
          down. The shared Drawer brings Esc, tap outside, focus kept inside
          and handed back to the menu button, and no scrolling behind it. */}
      <Drawer
        open={menuOpen}
        onClose={closeMenu}
        title="Menu"
        widthClass="max-w-sm"
        footer={
          <Link
            href="/login"
            onClick={closeMenu}
            className={cn(
              "flex min-h-11 w-full items-center justify-center rounded-lg py-3 text-[15px] font-semibold",
              greenSignIn ? "bg-grass text-on-primary hover:bg-grass-600" : "border border-input text-ink"
            )}
          >
            Sign in
          </Link>
        }
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {MARKETING_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                onClick={closeMenu}
                className={cn(
                  "flex min-h-11 items-center rounded-lg px-3 py-3 text-[15px]",
                  isActive(l.href) ? "bg-grass-50 font-semibold text-grass" : "text-ink"
                )}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </Drawer>
    </header>
  );
}
