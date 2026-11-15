import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { DashboardView } from "@/components/dashboard/dashboard-view";

// Seeded's new home for what /dashboard used to serve. Same view component
// (it already branches Legacy/Seeded internally) — Phase 4 rebuilds its
// Seeded-side content pixel-exact to Today.dc.html; this phase is only
// about the route/shell existing.
// Behind AuthGate and disallowed in robots.txt; the meta tag is the
// belt-and-braces half, because robots.txt is a request and a meta robots
// tag is an instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Today — Seeded",
  robots: { index: false, follow: false },
};

export default async function TodayPage() {
  const schools = await getSchoolsLite();
  return <DashboardView schools={schools} />;
}
