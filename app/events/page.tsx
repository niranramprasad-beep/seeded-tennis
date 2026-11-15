import type { Metadata } from "next";
import { Suspense } from "react";
import { getTrainingPlans } from "@/lib/db/plan";
import { SeededEventsView } from "@/components/seeded/events/seeded-events-view";

// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Events — Seeded",
  robots: { index: false, follow: false },
};

export default async function EventsPage() {
  const plans = await getTrainingPlans();
  return (
    <Suspense fallback={null}>
      <SeededEventsView plans={plans} />
    </Suspense>
  );
}
