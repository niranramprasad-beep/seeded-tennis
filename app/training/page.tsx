import type { Metadata } from "next";
import { getTrainingPlans } from "@/lib/db/plan";
import { TrainingView } from "@/components/training/training-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Training — Seeded",
  robots: { index: false, follow: false },
};

export default async function TrainingPage() {
  const plans = await getTrainingPlans();
  return (
    <SeededRouteRedirect to="/events">
      <TrainingView plans={plans} />
    </SeededRouteRedirect>
  );
}
