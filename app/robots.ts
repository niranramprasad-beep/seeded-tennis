import type { MetadataRoute } from "next";
import { PRIVATE_ROUTE_PREFIXES } from "@/lib/seo/private-routes";

const BASE_URL = "https://seededtennis.com";

// The disallow list is NOT written here any more. It was, and it drifted:
// it named /dashboard, /roadmap and /coaches while the live auth-gated
// routes (/today, /plan, /outreach, /events) were missing. See
// lib/seo/private-routes.ts, and the test that walks the app directory and
// fails the build when a new gated route is not covered.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_ROUTE_PREFIXES],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
