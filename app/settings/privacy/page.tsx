import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { SettingsView } from "@/components/settings/settings-view";

// Private: behind an AuthGate and disallowed in robots.txt.
export const metadata: Metadata = {
  title: "Privacy + data — Settings — Seeded",
  robots: { index: false, follow: false },
};

// Download and delete. Reachable before onboarding and while an under-13
// account waits for consent (lib/route-access.ts: /settings is a prefix).
// Schools are needed for the spreadsheet download's target-school rows.
export default async function SettingsPrivacyPage() {
  const schools = await getSchoolsLite();
  return <SettingsView schools={schools} section="privacy" />;
}
