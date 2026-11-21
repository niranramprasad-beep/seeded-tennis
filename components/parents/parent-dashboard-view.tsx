"use client";

import type { SchoolLite } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { SeededFamilyOverview } from "@/components/seeded/family/seeded-family-overview";
import { FamilyDashboardSkeleton } from "@/components/seeded/family/dashboard/dashboard-skeleton";

// /family is the Overview. The sidebar's PARENT_NAV_LINKS route Budget and
// Weekly reports to their own /family/budget and /family/weekly-reports
// pages, so there is no in-page tab state here. The session wait shows the
// dashboard's own skeleton — the same boxes app/family/loading.tsx and the
// overview's data wait show.
export function ParentDashboardView({ schools }: { schools: SchoolLite[] }) {
  return (
    <AuthGate fallback={<FamilyDashboardSkeleton />}>
      <SeededFamilyOverview schools={schools} />
    </AuthGate>
  );
}
