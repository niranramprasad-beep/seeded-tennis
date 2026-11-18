import { FamilyDashboardSkeleton } from "@/components/seeded/family/dashboard/dashboard-skeleton";

// The same boxes AuthGate and the overview show while they wait, so a
// redirect into /family moves through one unchanging skeleton.
export default function FamilyLoading() {
  return <FamilyDashboardSkeleton />;
}
