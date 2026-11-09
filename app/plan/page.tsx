import { getSchoolsLite } from "@/lib/db/schools";
import { RoadmapView } from "@/components/roadmap/roadmap-view";

// Seeded's new home for what /roadmap used to serve. Phase 4 rebuilds its
// Seeded-side content pixel-exact to PlayerProfile.dc.html.
export default async function PlanPage() {
  const schools = await getSchoolsLite();
  return <RoadmapView schools={schools} />;
}
