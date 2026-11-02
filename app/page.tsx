import { getSchoolsLite } from "@/lib/data";
import { HomeDesignSwitch } from "@/components/home/home-design-switch";
import { AuthedHomeRedirect } from "@/components/home/authed-home-redirect";

export default async function HomePage() {
  const schools = await getSchoolsLite();
  const marqueeSchools = schools.slice(0, 18);

  return (
    <>
      <AuthedHomeRedirect />
      <HomeDesignSwitch marqueeSchools={marqueeSchools} />
    </>
  );
}
