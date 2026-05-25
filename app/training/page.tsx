import { getTrainingPlans } from "@/lib/data";
import { TrainingView } from "@/components/training/training-view";

export default async function TrainingPage() {
  const plans = await getTrainingPlans();
  return <TrainingView plans={plans} />;
}
