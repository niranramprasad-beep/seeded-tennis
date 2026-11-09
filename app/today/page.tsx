import { getSchoolsLite } from "@/lib/db/schools";
import { DashboardView } from "@/components/dashboard/dashboard-view";

// Seeded's new home for what /dashboard used to serve. Same view component
// (it already branches Legacy/Seeded internally) — Phase 4 rebuilds its
// Seeded-side content pixel-exact to Today.dc.html; this phase is only
// about the route/shell existing.
export default async function TodayPage() {
  const schools = await getSchoolsLite();
  return <DashboardView schools={schools} />;
}
