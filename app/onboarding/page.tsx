import type { Metadata } from "next";
import { getSchoolsLite } from "@/lib/db/schools";
import { prefillFromSearchParams } from "@/lib/onboarding/diagnostic";
import { OnboardingPageSwitch } from "@/components/seeded/onboarding/onboarding-page-switch";

export const metadata: Metadata = {
  title: "Your free fit report — Seeded",
  description:
    "Up to ten quick questions, about 90 seconds. See which college tennis programs are a Safe bet, Good match or Stretch for you, with no account needed.",
  alternates: { canonical: "/onboarding" },
};

// The homepage calculator links here as /onboarding?utr=…&gradYear=…&gender=…
// The query string is read HERE, on the server, and handed down as props —
// not with useSearchParams() in the client, which bails the whole subtree
// out of server rendering and left a crawler (and a no-JS visitor) with an
// empty <main>.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [schools, params] = await Promise.all([getSchoolsLite(), searchParams]);
  const { answers, prefilled } = prefillFromSearchParams(params);
  return <OnboardingPageSwitch schools={schools} initialAnswers={answers} prefilled={prefilled} />;
}
