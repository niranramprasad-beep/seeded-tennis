import { getSchools } from "@/lib/db/schools";
import { CoachesView } from "@/components/coaches/coaches-view";

// Seeded's new home for what /coaches used to serve. Phase 4 rebuilds its
// Seeded-side content pixel-exact to Outreach.dc.html.
export default async function OutreachPage() {
  const schools = await getSchools();
  return <CoachesView schools={schools} />;
}
