"use client";

import type { SchoolLite } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { BudgetPageSkeleton } from "@/components/seeded/family/dashboard/page-skeletons";
import { SeededFamilyBudgetView } from "@/components/seeded/family/seeded-family-budget-view";

// /family/budget: the season budget, behind AuthGate (which shows the
// budget page's own skeleton while the session check runs).
export function ParentBudgetView({ schools }: { schools: SchoolLite[] }) {
  return (
    <AuthGate fallback={<BudgetPageSkeleton />}>
      <SeededFamilyBudgetView schools={schools} />
    </AuthGate>
  );
}
