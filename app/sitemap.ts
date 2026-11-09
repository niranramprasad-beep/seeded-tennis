import type { MetadataRoute } from "next";
import { getSchoolsLite } from "@/lib/db/schools";

const BASE_URL = "https://seededtennis.com";

// Only real, public, content-worthy routes — never dev-only pages, the API,
// or anything behind AuthGate (dashboard, roadmap, family, settings,
// matches, match-mode, training, coaches). See app/robots.ts for the
// matching disallow list.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const schools = await getSchoolsLite();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/onboarding`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/schools`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/tournament-fit`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/cost-calculator`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/parents`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const schoolRoutes: MetadataRoute.Sitemap = schools.map((s) => ({
    url: `${BASE_URL}/schools/${s.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...schoolRoutes];
}
