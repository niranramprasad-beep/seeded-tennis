// Shown on /settings/profile when /onboarding sent an already-onboarded
// account here (D2). The questions are for setting a profile up once; after
// that, this page is where it changes.
const FROM_ONBOARDING_NOTE = "Update your profile here";

export function FromOnboardingNote() {
  return (
    <p
      role="status"
      className="rounded-card border border-line bg-card px-5 py-3 text-[15px] text-ink"
      data-testid="from-onboarding-note"
    >
      <span className="font-semibold">{FROM_ONBOARDING_NOTE}.</span>{" "}
      <span className="text-stone">You&rsquo;ve already set up your account, so changes go on this page.</span>
    </p>
  );
}
