import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { OnboardingPageSwitch } from "@/components/onboarding/onboarding-page-switch";

export const metadata: Metadata = {
  title: "Your free fit report — Seeded",
  description:
    "See which college tennis programs are a realistic Reach, Target or Likely fit for your UTR — free, in 60 seconds, no account required.",
  alternates: { canonical: "/onboarding" },
};

export default async function OnboardingPage() {
  const schools = await getSchoolsLite();
  return <OnboardingPageSwitch schools={schools} />;
}
