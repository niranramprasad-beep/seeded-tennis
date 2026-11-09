import { getSchoolsLite } from "@/lib/data";
import { ParentDashboardView } from "@/components/parents/parent-dashboard-view";

export default async function FamilyPage() {
  const schools = await getSchoolsLite();
  return <ParentDashboardView schools={schools} />;
}
