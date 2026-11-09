import type { Metadata } from "next";
import { SampleReportView } from "@/components/seeded/sample-report/sample-report-view";

export const metadata: Metadata = {
  title: "Sample Parent Report — Seeded",
  description:
    "See what Seeded's weekly parent report looks like: UTR trend vs. plan, this week's decision, coach outreach status, season spending, and what's coming up. Example data — sign up to get your own family's real report.",
};

// Public marketing page, no auth needed — pixel-exact to "12 Sample parent
// report.png". Deliberately NOT linked from inside the authenticated app
// shell; see the honesty-discipline comment at the top of
// components/seeded/sample-report/sample-report-view.tsx.
export default function SampleReportPage() {
  return <SampleReportView />;
}
