import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { HomeDesignSwitch } from "@/components/home/home-design-switch";
import { AuthedHomeRedirect } from "@/components/home/authed-home-redirect";

export const metadata: Metadata = {
  title: "Seeded — your path to college tennis, mapped",
  description:
    "Enter your UTR and grad year. Seeded compares you to real programs, sorts schools into Reach, Target and Likely, and turns the gap into season targets you plan against, with a family view your parents can follow.",
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
