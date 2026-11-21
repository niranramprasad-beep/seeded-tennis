// The routes a signed-out visitor cannot use, in one place.
//
// WHY THIS FILE EXISTS. `app/robots.ts` carried a hand-written disallow list
// that had drifted: it named `/dashboard`, `/roadmap` and `/coaches` — the
// routes the Seeded rebuild SUPERSEDED — while the live, auth-gated routes
// the 5-item nav actually points at (`/today`, `/plan`, `/outreach`,
// `/events`) were missing. Google was being invited to crawl the real
// private pages and warned off the dead ones.
//
// Nothing leaked: every one of those pages redirects a signed-out visitor to
// /login, so a crawler sees the login page. It was still wrong, and the next
// renamed route would have repeated it silently.
//
// `lib/seo/robots-coverage.test.ts` walks every `app/**/page.tsx`, follows
// its component imports, and fails the build if a route whose tree contains
// an `AuthGate` is not covered here.

/** Prefixes robots.txt disallows. A prefix covers its children, so `/family`
 * also covers `/family/budget` and `/family/weekly-reports`. */
export const PRIVATE_ROUTE_PREFIXES = [
  // The live, auth-gated product (the 5-item nav plus what hangs off it).
  "/today",
  "/plan",
  "/outreach",
  "/events",
  "/family",
  "/settings",
  "/matches",
  "/match-mode",

  // Superseded route names, kept disallowed: they still resolve.
  "/dashboard",
  "/roadmap",
  "/training",
  "/coaches",

  // Superseded and no longer public content: /cost-calculator redirects to
  // /family, so a crawler is bounced to /login. It was listed in the
  // sitemap as a public page.
  "/cost-calculator",

  // Never content.
  // Owner-only tools (catalog phase 1, migration 048). The page refuses
  // anyone is_app_admin() says no to; RLS refuses their writes regardless.
  "/admin/",
  "/api/",
  "/dev/",
  "/auth/",
  "/reset-password",
] as const;

/** Routes that DO render an AuthGate but are still legitimately public, with
 * the reason. The coverage test exempts exactly these and nothing else, so
 * adding one is a deliberate act with a justification attached. */
export const GATED_BUT_PUBLIC: Record<string, string> = {
  "/onboarding":
    "The free fit report. A signed-out Seeded visitor gets SeededPreAuthOnboarding; " +
    "the AuthGate only wraps the signed-in continuation (target schools, weaknesses). " +
    "This is the top of the funnel and must stay crawlable.",
};

/** Public pages worth indexing that are not school pages. Keep in step with
 * `app/sitemap.ts` — the test below asserts the sitemap covers all of them. */
export const PUBLIC_CONTENT_ROUTES = [
  "/",
  "/onboarding",
  "/pricing",
  "/schools",
  "/tournament-fit",
  "/how-it-works",
  "/parents",
  "/methodology",
  "/sample-report",
  "/contact",
  "/privacy",
  "/terms",
] as const;

export function isPrivateRoute(route: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some((p) =>
    p.endsWith("/") ? route.startsWith(p) : route === p || route.startsWith(`${p}/`)
  );
}
