"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SUPPORT_EMAIL } from "@/lib/config/contact";
import { cn } from "@/lib/utils";

/**
 * Design system v2's ONE slim footer (docs/DESIGN_MOCKUP_SPEC_V2.md, shared
 * parts): Seeded · How we calculate fit · Privacy · Terms · support@. It is
 * rendered once, by AppShell, on every route — pages never render their own.
 *
 * Before this there were three footers: a four-column one on six marketing
 * pages, a minimal one on the homepage only, and nothing at all on
 * /methodology, /privacy, /terms, /contact, the auth pages and the app.
 */
// Pages whose content column is the 1200px marketing one (the public nav's
// width). Every other page a signed-in user sees inside the sidebar shell
// uses `max-w-content container-px`, and the footer follows that column.
const MARKETING_COLUMN_ROUTES = ["/", "/parents", "/how-it-works", "/methodology", "/onboarding", "/sample-report"];

export function Footer({ inApp = false }: { inApp?: boolean } = {}) {
  const pathname = usePathname() ?? "/";
  // PR-POLISH (2026-11-20): inside the app the footer used the marketing
  // column (1200px, 24px padding) while every app page uses max-w-content +
  // container-px, so at 1440 the footer text started ~17px left of the
  // content and its rule ran the full width of the window. It now sits in
  // the same column as the page above it, rule included.
  const appColumn = inApp && !MARKETING_COLUMN_ROUTES.includes(pathname);
  const linkClass =
    "inline-flex min-h-11 items-center text-stone underline-offset-2 transition-colors hover:text-ink hover:underline sm:min-h-6";
  return (
    <footer className={appColumn ? "mx-auto max-w-content container-px" : "border-t border-line"}>
      <div
        className={cn(
          "flex flex-col gap-x-6 gap-y-1 py-6 text-sm sm:flex-row sm:flex-wrap sm:items-center",
          appColumn ? "border-t border-line" : "mx-auto max-w-[1200px] px-6"
        )}
      >
        <span className="font-seeded font-semibold text-ink sm:mr-auto">Seeded</span>
        <Link href="/methodology" className={linkClass}>
          How we calculate fit
        </Link>
        <Link href="/privacy" className={linkClass}>
          Privacy
        </Link>
        <Link href="/terms" className={linkClass}>
          Terms
        </Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className={cn(linkClass, "break-all")}>
          {SUPPORT_EMAIL}
        </a>
      </div>
    </footer>
  );
}
