import { getTrainingPlans } from "@/lib/data";
import { SeededEventsView } from "@/components/seeded/events/seeded-events-view";

export default async function EventsPage() {
  const plans = await getTrainingPlans();
  return <SeededEventsView plans={plans} />;
}
