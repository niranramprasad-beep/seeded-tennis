import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { RoadmapView } from "@/components/roadmap/roadmap-view";

// Seeded's new home for what /roadmap used to serve. Phase 4 rebuilds its
// Seeded-side content pixel-exact to PlayerProfile.dc.html.
// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Plan — Seeded",
  robots: { index: false, follow: false },
};

export default async function PlanPage() {
  const schools = await getSchoolsLite();
  return <RoadmapView schools={schools} />;
}
