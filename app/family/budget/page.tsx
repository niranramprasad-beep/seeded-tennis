import { getSchoolsLite } from "@/lib/db/schools";
import { ParentBudgetView } from "@/components/parents/parent-budget-view";

export default async function FamilyBudgetPage() {
  const schools = await getSchoolsLite();
  return <ParentBudgetView schools={schools} />;
}
