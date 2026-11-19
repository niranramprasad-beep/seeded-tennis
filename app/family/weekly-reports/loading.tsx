import { WeeklyReportSkeleton } from "@/components/seeded/family/dashboard/page-skeletons";

// The same boxes AuthGate and the page show while they wait (rule 6).
export default function FamilyWeeklyReportsLoading() {
  return <WeeklyReportSkeleton />;
}
