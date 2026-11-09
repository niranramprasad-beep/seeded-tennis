import { getSchools } from "@/lib/db/schools";
import { CoachesView } from "@/components/coaches/coaches-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

export default async function CoachesPage() {
  const schools = await getSchools();
  return (
    <SeededRouteRedirect to="/outreach">
      <CoachesView schools={schools} />
    </SeededRouteRedirect>
  );
}
