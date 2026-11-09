import { notFound } from "next/navigation";
import { getSchoolsLite } from "@/lib/db/schools";
import { FamilyWeeklyReportPreview } from "@/components/dev/family-weekly-report-preview";

export default async function DevFamilyWeeklyReportPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const schools = await getSchoolsLite();
  return <FamilyWeeklyReportPreview schools={schools} />;
}
