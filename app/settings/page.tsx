import { getSchoolsLite } from "@/lib/data";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const schools = await getSchoolsLite();
  return <SettingsView schools={schools} />;
}
