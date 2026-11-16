import type { Metadata } from "next";
import { getSchools } from "@/lib/db/schools";
import { CoachesView } from "@/components/coaches/coaches-view";

// Seeded's new home for what /coaches used to serve. Phase 4 rebuilds its
// Seeded-side content pixel-exact to Outreach.dc.html.
// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Outreach — Seeded",
  robots: { index: false, follow: false },
};

export default async function OutreachPage() {
  const schools = await getSchools();
  return <CoachesView schools={schools} />;
}
