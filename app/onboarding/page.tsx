import { getSchoolsLite } from "@/lib/data";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { AuthGate } from "@/components/shared/auth-gate";

export default async function OnboardingPage() {
  const schools = await getSchoolsLite();
  return (
    <AuthGate>
      <OnboardingFlow schools={schools} />
    </AuthGate>
  );
}
