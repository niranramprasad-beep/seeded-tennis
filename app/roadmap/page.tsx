import { getSchoolsLite } from "@/lib/data";
import { RoadmapView } from "@/components/roadmap/roadmap-view";

export default async function RoadmapPage() {
  const schools = await getSchoolsLite();
  return <RoadmapView schools={schools} />;
}
