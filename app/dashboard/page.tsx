import { getSchools, getTrainingPlans } from "@/lib/data";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const [schools, plans] = await Promise.all([getSchools(), getTrainingPlans()]);

  return <DashboardView schools={schools} plans={plans} />;
}
