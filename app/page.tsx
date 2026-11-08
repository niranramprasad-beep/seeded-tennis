import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/data";
import { HomeDesignSwitch } from "@/components/home/home-design-switch";
import { AuthedHomeRedirect } from "@/components/home/authed-home-redirect";

export const metadata: Metadata = {
  title: "Seeded — your path to college tennis, mapped",
  description:
    "Enter your UTR and grad year. Seeded compares you to real rosters, sorts schools into Reach, Target and Likely, and turns the gap into a week-by-week plan your parents can see.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const schools = await getSchoolsLite();
  const marqueeSchools = schools.slice(0, 18);

  return (
    <>
      <AuthedHomeRedirect />
      <HomeDesignSwitch schools={schools} marqueeSchools={marqueeSchools} />
    </>
  );
}
