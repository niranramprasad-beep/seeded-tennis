import { getSchools } from "@/lib/data";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { AuthGate } from "@/components/shared/auth-gate";

export default async function OnboardingPage() {
  const schools = await getSchools();
  return (
    <AuthGate>
      <OnboardingFlow schools={schools} />
    </AuthGate>
  );
}
