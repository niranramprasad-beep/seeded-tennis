import { getSchoolsLite } from "@/lib/data";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const schools = await getSchoolsLite();

  return <DashboardView schools={schools} />;
}
