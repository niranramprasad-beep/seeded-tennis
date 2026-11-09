import { getSchoolsLite } from "@/lib/db/schools";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

export default async function DashboardPage() {
  const schools = await getSchoolsLite();

  return (
    <SeededRouteRedirect to="/today">
      <DashboardView schools={schools} />
    </SeededRouteRedirect>
  );
}
