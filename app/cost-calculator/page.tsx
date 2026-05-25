import { getSchools } from "@/lib/data";
import { CostCalculatorView } from "@/components/cost/cost-calculator-view";

export default async function CostCalculatorPage() {
  const schools = await getSchools();
  return <CostCalculatorView schools={schools} />;
}
