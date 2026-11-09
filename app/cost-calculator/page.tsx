import { getSchoolsLite } from "@/lib/db/schools";
import { CostCalculatorView } from "@/components/cost/cost-calculator-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

export default async function CostCalculatorPage() {
  const schools = await getSchoolsLite();
  return (
    <SeededRouteRedirect to="/family">
      <CostCalculatorView schools={schools} />
    </SeededRouteRedirect>
  );
}
