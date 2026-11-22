import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TASK 2. The Google button must render only when
// NEXT_PUBLIC_GOOGLE_AUTH_ENABLED is exactly "true".
//
// It did not. The flag check lived in `AuthCard`, and `signup-flow.tsx`
// renders `<GoogleButton>` directly — so /signup showed the button with the
// flag unset. Caught in a 375px screenshot, not by a test, which is why
// there is now a test.
//
// This is a source-level check rather than a render test because the flag is
// read at module load from `process.env.NEXT_PUBLIC_*`, which Next inlines at
// build time: by the time a component renders under vitest the value is
// already baked, and a test that sets process.env afterwards would be
// testing nothing. What can be checked, and what actually broke, is that the
// guard sits inside the component every caller goes through.

const read = (...p: string[]) => readFileSync(join(__dirname, ...p), "utf8");

describe("the Google button cannot render with the flag off", () => {
  const card = read("auth-card.tsx");

  it("guards inside GoogleButton itself, not only in its wrapper", () => {
    const fn = card.slice(card.indexOf("export function GoogleButton"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("if (!GOOGLE_AUTH_ENABLED) return null;");
  });

  it("guards the divider too, so an 'or' cannot appear alone", () => {
    const fn = card.slice(card.indexOf("export function GoogleDivider"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("if (!GOOGLE_AUTH_ENABLED) return null;");
  });

  it("guards 'Verify with Google instead' too (PR D, final-check)", () => {
    const fn = card.slice(card.indexOf("export function GoogleVerifyButton"));
    const body = fn.slice(0, fn.indexOf("\n/**"));
    expect(body).toContain("if (!GOOGLE_AUTH_ENABLED) return null;");
  });

  it("reads the flag strictly — only the exact string \"true\"", () => {
    const config = readFileSync(
      join(__dirname, "..", "..", "lib", "config", "auth.ts"),
      "utf8"
    );
    expect(config).toContain('process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"');
  });

  it("has exactly ONE caller of signInWithGoogle, in the guarded component", () => {
    // This test used to iterate three hand-picked filenames in
    // components/auth/. A FOURTH caller already existed —
    // components/seeded/onboarding/seeded-pre-auth-onboarding.tsx hand-rolled
    // its own button with no flag check, on a PUBLIC page — and the test
    // passed anyway, because it only looked where I expected the answer to
    // be. An independent verifier found it by running a plain grep.
    //
    // So: grep the whole repo. The only legitimate caller is GoogleButton in
    // auth-card.tsx, which carries the guard. Anything else is a button that
    // can render with the flag off.
    const out = execSync(
      "grep -rln 'signInWithGoogle' --include='*.ts' --include='*.tsx' app components lib || true",
      { cwd: join(__dirname, "..", ".."), encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean)
      // lib/auth.ts defines it; policy.ts cites it as a source; this file
      // names it in prose. None of them render a button.
      .filter(
        (f) =>
          f !== "lib/auth.ts" &&
          f !== "lib/legal/policy.ts" &&
          // Tests name it in assertions; none of them render a button.
          !/\.test\.tsx?$/.test(f)
      );

    expect(
      out.sort(),
      `signInWithGoogle must only be called from the guarded GoogleButton. ` +
        `Extra callers found: ${out.join(", ")}`
    ).toEqual(["components/auth/auth-card.tsx"]);
  });

  it("renders the Google label only through the guarded component", () => {
    // The other half of the invariant. Mentioning the words is fine —
    // signup-flow passes a custom label, login-form is a comment. What is
    // not fine is a file that renders them WITHOUT going through
    // GoogleButton, which is how the pre-auth page ended up with a live
    // button and no flag check.
    const repoRoot = join(__dirname, "..", "..");
    const files = execSync(
      "grep -rln 'with Google' --include='*.tsx' app components || true",
      { cwd: repoRoot, encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      if (file === "components/auth/auth-card.tsx") continue;
      const src = readFileSync(join(repoRoot, file), "utf8");
      expect(
        /from "(?:\.\/|\.\.\/)*(?:@\/components\/auth\/)?auth-card"/.test(src) ||
          src.includes('from "@/components/auth/auth-card"'),
        `${file} mentions the Google label but does not import the guarded button from auth-card`
      ).toBe(true);
    }
  });
});
