// The homepage fit calculator's link into /onboarding.
//
// The calculator starts on EXAMPLE values (UTR 9.4, GPA 3.7, women's, a
// grad year) and says so ("Example output"). /onboarding treats every query
// value as an answer — it skips that question and saves the value to the
// new account (lib/onboarding/diagnostic.ts prefillFromSearchParams). So
// only a field the visitor actually changed may travel. Before 2026-11-20 a
// visitor who clicked straight through had onboarding pre-answered with
// Seeded's example numbers, and the phone card (which has no GPA field)
// sent a GPA of 3.7 the visitor never saw.

export type CalculatorField = "utr" | "gradYear" | "gender" | "gpa";

const ORDER: readonly CalculatorField[] = ["utr", "gradYear", "gender", "gpa"];

/** The /onboarding query: ONLY the fields in `touched`. Empty string when
 * the visitor changed nothing. */
export function onboardingQueryFor(
  values: Record<CalculatorField, string>,
  touched: ReadonlySet<CalculatorField>
): string {
  const params = new URLSearchParams();
  for (const field of ORDER) {
    if (touched.has(field)) params.set(field, values[field]);
  }
  return params.toString();
}
