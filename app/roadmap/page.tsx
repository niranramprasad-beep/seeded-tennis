import { getSchoolsLite } from "@/lib/data";
import { RoadmapView } from "@/components/roadmap/roadmap-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

export default async function RoadmapPage() {
  const schools = await getSchoolsLite();
  return (
    <SeededRouteRedirect to="/plan">
      <RoadmapView schools={schools} />
    </SeededRouteRedirect>
  );
}
