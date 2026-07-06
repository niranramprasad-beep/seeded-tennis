import { getSchools } from "@/lib/data";
import { CoachesView } from "@/components/coaches/coaches-view";

export default async function CoachesPage() {
  const schools = await getSchools();
  return <CoachesView schools={schools} />;
}
