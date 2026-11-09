import { getSchoolsLite } from "@/lib/data";
import { ParentWeeklyReportView } from "@/components/parents/parent-weekly-report-view";

export default async function FamilyWeeklyReportsPage() {
  const schools = await getSchoolsLite();
  return <ParentWeeklyReportView schools={schools} />;
}
