import { notFound } from "next/navigation";
import { getSchoolsLite } from "@/lib/db/schools";
import { FamilyPreview } from "@/components/dev/family-preview";

export default async function DevFamilyPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const schools = await getSchoolsLite();
  return <FamilyPreview schools={schools} />;
}
