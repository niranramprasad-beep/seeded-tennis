import { getSchools, getTournaments, getTrainingPlans } from "@/lib/data";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const [schools, tournaments, plans] = await Promise.all([
    getSchools(),
    getTournaments(),
    getTrainingPlans(),
  ]);

  return (
    <DashboardView schools={schools} tournaments={tournaments} plans={plans} />
  );
}
