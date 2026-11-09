import { notFound } from "next/navigation";
import { getSchoolsLite } from "@/lib/db/schools";
import { TodayPreview } from "@/components/dev/today-preview";

export default async function DevTodayPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const schools = await getSchoolsLite();
  const targetSchools = schools.filter((s) =>
    ["north-carolina-w", "nc-state-w", "texas-w"].includes(s.slug)
  );

  return <TodayPreview targetSchools={targetSchools} />;
}
