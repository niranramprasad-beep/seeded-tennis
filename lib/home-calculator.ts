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

/** The card's footnote. "Example output" only while every value is still
 *  Seeded's example; once the visitor changes one the counts are theirs
 *  (final-check A13: the label stayed after they typed). */
export const EXAMPLE_OUTPUT_NOTE = "Example output. Counts depend on your inputs.";
export const OWN_OUTPUT_NOTE = "From your inputs, against each team's range: a hand-checked roster where we have one, our estimate elsewhere.";
export function heroOutputNote(touched: ReadonlySet<CalculatorField>): string {
  return touched.size === 0 ? EXAMPLE_OUTPUT_NOTE : OWN_OUTPUT_NOTE;
}

/** The card's button. Untouched, its count is the EXAMPLE's — and the
 *  example values deliberately do not travel to /onboarding (above), so
 *  "See my 10 …" promised a number the next screen does not show. Untouched
 *  it names no count (final-check A13). */
export function heroButtonLabel(ctaLabel: string, touched: ReadonlySet<CalculatorField>): string {
  return touched.size === 0 ? "Check my own fit" : ctaLabel;
}
