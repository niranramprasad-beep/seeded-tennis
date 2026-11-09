import { notFound } from "next/navigation";
import { getSchoolsLite } from "@/lib/data";
import { FamilyBudgetPreview } from "@/components/dev/family-budget-preview";

export default async function DevFamilyBudgetPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const schools = await getSchoolsLite();
  return <FamilyBudgetPreview schools={schools} />;
}
