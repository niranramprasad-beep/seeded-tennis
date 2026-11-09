import { notFound } from "next/navigation";
import { getSchoolsLite } from "@/lib/db/schools";
import { PlanPreview } from "@/components/dev/plan-preview";

export default async function DevPlanPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const schools = await getSchoolsLite();
  const targetSchools = schools.filter((s) =>
    ["north-carolina-w", "nc-state-w", "texas-w"].includes(s.slug)
  );

  return <PlanPreview targetSchools={targetSchools} />;
}
