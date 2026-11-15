import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { CostCalculatorView } from "@/components/cost/cost-calculator-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Cost calculator — Seeded",
  robots: { index: false, follow: false },
};

export default async function CostCalculatorPage() {
  const schools = await getSchoolsLite();
  return (
    <SeededRouteRedirect to="/family">
      <CostCalculatorView schools={schools} />
    </SeededRouteRedirect>
  );
}
