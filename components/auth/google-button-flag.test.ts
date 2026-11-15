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

  it("reads the flag strictly — only the exact string \"true\"", () => {
    const config = readFileSync(
      join(__dirname, "..", "..", "lib", "config", "auth.ts"),
      "utf8"
    );
    expect(config).toContain('process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"');
  });

  it("has no caller that reimplements the Google button", () => {
    // A second button somewhere would not be covered by the guard above.
    for (const file of ["signup-flow.tsx", "login-form.tsx", "complete-oauth-signup.tsx"]) {
      const src = read(file);
      expect(src, file).not.toContain("signInWithGoogle(");
    }
  });
});
