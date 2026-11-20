import type { Metadata } from "next";
import { SettingsIndexRedirect } from "@/components/settings/settings-index-redirect";

// Behind an AuthGate (on each section) and disallowed in robots.txt. The
// meta tag is the belt-and-braces half: robots.txt is a request, a meta
// robots tag is an instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Settings — Seeded",
  robots: { index: false, follow: false },
};

// Every Settings section has its own URL (lib/settings-sections.ts). This
// page only forwards to one, keeping old `?tab=` and `#section` links
// working; the section page's own AuthGate does the signed-in checks.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  return <SettingsIndexRedirect tab={tab ?? null} />;
}
