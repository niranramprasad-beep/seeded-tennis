import type { MetadataRoute } from "next";

const BASE_URL = "https://seededtennis.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dev/",
        "/dashboard",
        "/roadmap",
        "/family",
        "/settings",
        "/matches",
        "/match-mode",
        "/training",
        "/coaches",
        "/reset-password",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
