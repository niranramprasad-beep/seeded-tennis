import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { DashboardView } from "@/components/dashboard/dashboard-view";

// The player's home (what /dashboard used to serve; /dashboard now
// redirects here). DashboardView owns the data; SeededDashboardLayout is
// pixel-exact to Today.dc.html.
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
