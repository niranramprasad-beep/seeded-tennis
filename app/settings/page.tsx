import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { SettingsView } from "@/components/settings/settings-view";

// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Settings — Seeded",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const schools = await getSchoolsLite();
  return <SettingsView schools={schools} />;
}
