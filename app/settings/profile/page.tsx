import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { SettingsView } from "@/components/settings/settings-view";

// Private: behind an AuthGate and disallowed in robots.txt (/settings is a
// prefix there, so every section is covered).
export const metadata: Metadata = {
  title: "Profile — Settings — Seeded",
  robots: { index: false, follow: false },
};

// ?from=onboarding is /onboarding's redirect for an account that has
// already onboarded; it shows "Update your profile here". Read on the
// server and passed down, so no useSearchParams() bailout.
export default async function SettingsProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [schools, params] = await Promise.all([getSchoolsLite(), searchParams]);
  return <SettingsView schools={schools} section="profile" fromOnboarding={params.from === "onboarding"} />;
}
