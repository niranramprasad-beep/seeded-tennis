import { getSchools } from "@/lib/data";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export default async function OnboardingPage() {
  const schools = await getSchools();
  return <OnboardingFlow schools={schools} />;
}
