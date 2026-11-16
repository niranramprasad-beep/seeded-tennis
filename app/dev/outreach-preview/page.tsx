import { notFound } from "next/navigation";
import { getSchoolsBySlugs } from "@/lib/db/schools";
import { OutreachPreview } from "@/components/dev/outreach-preview";

export default async function DevOutreachPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const targetSchools = await getSchoolsBySlugs([
    "north-carolina-w",
    "nc-state-w",
    "texas-w",
    "florida-w",
    "middlebury-w",
  ]);

  return <OutreachPreview targetSchools={targetSchools} />;
}
