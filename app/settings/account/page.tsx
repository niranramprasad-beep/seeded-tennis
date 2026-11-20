import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

// Private: behind an AuthGate and disallowed in robots.txt.
export const metadata: Metadata = {
  title: "Account — Settings — Seeded",
  robots: { index: false, follow: false },
};

// A player's account facts. A parent has no Account section; theirs
// renders Profile (sectionForRole).
export default function SettingsAccountPage() {
  return <SettingsView section="account" />;
}
