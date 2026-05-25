import { getSchools } from "@/lib/data";
import { RoadmapView } from "@/components/roadmap/roadmap-view";

export default async function RoadmapPage() {
  const schools = await getSchools();
  return <RoadmapView schools={schools} />;
}
