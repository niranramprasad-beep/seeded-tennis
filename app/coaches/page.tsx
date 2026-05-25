import { getSchools, getTournaments } from "@/lib/data";
import { CoachesView } from "@/components/coaches/coaches-view";

export default async function CoachesPage() {
  const [schools, tournaments] = await Promise.all([
    getSchools(),
    getTournaments(),
  ]);
  return <CoachesView schools={schools} tournaments={tournaments} />;
}
