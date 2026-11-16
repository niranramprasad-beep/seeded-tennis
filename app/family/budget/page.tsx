import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { ParentBudgetView } from "@/components/parents/parent-budget-view";

// Private: behind an AuthGate and disallowed in robots.txt.
export const metadata: Metadata = {
  title: "Season budget — Seeded",
  robots: { index: false, follow: false },
};

export default async function FamilyBudgetPage() {
  const schools = await getSchoolsLite();
  return <ParentBudgetView schools={schools} />;
}
