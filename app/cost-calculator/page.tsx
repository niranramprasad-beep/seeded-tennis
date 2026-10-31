import { getSchoolsLite } from "@/lib/data";
import { CostCalculatorView } from "@/components/cost/cost-calculator-view";

export default async function CostCalculatorPage() {
  const schools = await getSchoolsLite();
  return <CostCalculatorView schools={schools} />;
}
