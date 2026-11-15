import type { Metadata } from "next";
import { getSchools } from "@/lib/db/schools";
import { CoachesView } from "@/components/coaches/coaches-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Coaches — Seeded",
  robots: { index: false, follow: false },
};

export default async function CoachesPage() {
  const schools = await getSchools();
  return (
    <SeededRouteRedirect to="/outreach">
      <CoachesView schools={schools} />
    </SeededRouteRedirect>
  );
}
