import { getSchoolsLite } from "@/lib/db/schools";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const schools = await getSchoolsLite();
  return <SettingsView schools={schools} />;
}
