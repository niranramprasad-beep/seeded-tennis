import type { Metadata } from "next";
import { CheckinHistoryView } from "@/components/seeded/dashboard/checkin-history-view";

// Behind AuthGate; /today/* is disallowed in robots.txt (lib/seo/
// private-routes.ts covers children of /today).
export const metadata: Metadata = {
  title: "Check-ins — Seeded",
  robots: { index: false, follow: false },
};

export default function CheckinsPage() {
  return <CheckinHistoryView />;
}
