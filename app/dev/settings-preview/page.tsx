import { notFound } from "next/navigation";
import { getSchoolsLite } from "@/lib/data";
import { SettingsPreview } from "@/components/dev/settings-preview";

export default async function DevSettingsPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const schools = await getSchoolsLite();
  const targetSchools = schools.filter((s) =>
    ["north-carolina-w", "nc-state-w", "texas-w"].includes(s.slug)
  );

  return <SettingsPreview targetSchools={targetSchools} />;
}
