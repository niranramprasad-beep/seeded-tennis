import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

// Private: behind an AuthGate and disallowed in robots.txt.
export const metadata: Metadata = {
  title: "Family — Settings — Seeded",
  robots: { index: false, follow: false },
};

// Members, join requests, the 045 cap and "Leave family" (046).
// components/seeded/settings/settings-family-section.tsx.
export default function SettingsFamilyPage() {
  return <SettingsView section="family" />;
}
