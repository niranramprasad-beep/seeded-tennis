import { getSchoolsLite, getTrainingPlans } from "@/lib/data";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const [schools, plans] = await Promise.all([getSchoolsLite(), getTrainingPlans()]);

  return <DashboardView schools={schools} plans={plans} />;
}
