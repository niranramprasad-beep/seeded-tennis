"use client";

import type { SchoolLite } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { WeeklyReportSkeleton } from "@/components/seeded/family/dashboard/page-skeletons";
import { SeededWeeklyReportView } from "@/components/seeded/family/seeded-weekly-report-view";

// /family/weekly-reports, behind AuthGate (which shows the report page's own
// skeleton while the session check runs).
export function ParentWeeklyReportView({ schools }: { schools: SchoolLite[] }) {
  return (
    <AuthGate fallback={<WeeklyReportSkeleton />}>
      <SeededWeeklyReportView schools={schools} />
    </AuthGate>
  );
}
