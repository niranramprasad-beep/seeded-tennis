import { getTrainingPlans } from "@/lib/db/plan";
import { TrainingView } from "@/components/training/training-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

export default async function TrainingPage() {
  const plans = await getTrainingPlans();
  return (
    <SeededRouteRedirect to="/events">
      <TrainingView plans={plans} />
    </SeededRouteRedirect>
  );
}
