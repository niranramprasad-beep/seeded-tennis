import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { ParentWeeklyReportView } from "@/components/parents/parent-weekly-report-view";

// Private: behind an AuthGate and disallowed in robots.txt.
export const metadata: Metadata = {
  title: "Weekly reports — Seeded",
  robots: { index: false, follow: false },
};

export default async function FamilyWeeklyReportsPage() {
  const schools = await getSchoolsLite();
  return <ParentWeeklyReportView schools={schools} />;
}
