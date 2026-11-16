import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { ParentDashboardView } from "@/components/parents/parent-dashboard-view";

// Behind AuthGate and disallowed in robots.txt; the meta tag is the
// belt-and-braces half, because robots.txt is a request and a meta robots
// tag is an instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Your family — Seeded",
  robots: { index: false, follow: false },
};

export default async function FamilyPage() {
  const schools = await getSchoolsLite();
  return <ParentDashboardView schools={schools} />;
}
