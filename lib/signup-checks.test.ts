import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import { AUTH_ERROR_MESSAGES, friendlyAuthError } from "./auth";
import {
  EMAIL_FIELD_MESSAGES,
  EMAIL_FIELD_PREFIX,
  birthYearGradYearHint,
  birthYearGradeHint,
  emailFieldError,
  emailFieldErrorFromAuth,
  isPlausibleEmail,
  normalizeEmail,
  SIGNUP_EMAIL_STEP,
  signupFailureSendBack,
  usualBirthYearsForGradYear,
} from "./signup-checks";

// Final-check A6 / A16 (2026-11-21). Fails the build if:
//   - a bad email is no longer caught on the email field (on blur and before
//     step 1 is left), or its message stops naming the field;
//   - a server refusal of the address stops being sent back to that field;
//   - /signup's name placeholder reads like a person's name again;
//   - the birth-year / grade hint disappears or starts blocking.

const ROOT = join(__dirname, "..");
// 2026-11-21 is in school year "2027" (rollover Aug 1), so 10th grade = class of 2029.
const NOV_2026 = new Date(2026, 10, 21);

describe("isPlausibleEmail", () => {
  it.each([
    "player@gmail.com",
    "first.last+tennis@school.k12.ca.us",
    "  padded@example.org  ",
    "x@y.co",
    "o'brien@mail.ie",
    "name@sub-domain.example.com",
    "ñandú@correo.es",
    "user@example.xn--p1ai",
    "user@xn--80ak6aa92e.xn--p1ai",
  ])("accepts %s", (email) => expect(isPlausibleEmail(email)).toBe(true));

  it.each([
    "",
    "   ",
    "player",
    "player@",
    "@gmail.com",
    "player@gmail",
    "player@@gmail.com",
    "a@b@gmail.com",
    "player@gmail..com",
    "player@.gmail.com",
    "player@gmail.com.",
    "player@-gmail.com",
    "player@gmail-.com",
    "play er@gmail.com",
    "player@gm ail.com",
    "player@gmail.c",
    "player@gmail.c0m",
    "player@example.xn--",
    "player@example.xn--p1ai-",
    "player@example.xn--p_1ai",
    ".player@gmail.com",
    "player.@gmail.com",
    "pl..ayer@gmail.com",
    "player@gmail,com",
    "<player>@gmail.com",
    `${"a".repeat(65)}@gmail.com`,
  ])("rejects %j", (email) => expect(isPlausibleEmail(email)).toBe(false));

  it("normalizeEmail only trims", () => {
    expect(normalizeEmail("  Player@Gmail.com \t")).toBe("Player@Gmail.com");
  });
});

describe("emailFieldError", () => {
  it("names the field in every message", () => {
    for (const m of Object.values(EMAIL_FIELD_MESSAGES)) expect(m.startsWith(`${EMAIL_FIELD_PREFIX} `)).toBe(true);
  });

  it("on blur: an empty field is not an error yet; a malformed one is", () => {
    expect(emailFieldError("", { required: false })).toBeNull();
    expect(emailFieldError("  ", { required: false })).toBeNull();
    expect(emailFieldError("player@gmail", { required: false })).toBe(EMAIL_FIELD_MESSAGES.malformed);
    expect(emailFieldError("player@gmail.com", { required: false })).toBeNull();
  });

  it("on Continue / Create: empty is the problem", () => {
    expect(emailFieldError("", { required: true })).toBe(EMAIL_FIELD_MESSAGES.empty);
    expect(emailFieldError("nope", { required: true })).toBe(EMAIL_FIELD_MESSAGES.malformed);
    expect(emailFieldError(" player@gmail.com ", { required: true })).toBeNull();
  });

  it("the malformed message is the one the finding asked for", () => {
    expect(EMAIL_FIELD_MESSAGES.malformed).toMatch(/^Email: that address doesn't look right\./);
  });
});

describe("a server refusal of the ADDRESS goes back to the email field", () => {
  it("Supabase's email_address_invalid (code and prose) maps to the field", () => {
    const fromCode = friendlyAuthError({ code: "email_address_invalid", message: 'Email address "x@example.com" is invalid' });
    expect(fromCode).toBe(AUTH_ERROR_MESSAGES.invalidEmail);
    expect(emailFieldErrorFromAuth(fromCode)).toBe(EMAIL_FIELD_MESSAGES.refused);
    const fromProse = friendlyAuthError('Email address "x@example.com" is invalid');
    expect(emailFieldErrorFromAuth(fromProse)).toBe(EMAIL_FIELD_MESSAGES.refused);
  });

  it("email_address_not_authorized maps to the field too", () => {
    expect(emailFieldErrorFromAuth(friendlyAuthError({ code: "email_address_not_authorized", message: "" }))).toBe(
      EMAIL_FIELD_MESSAGES.notAllowed
    );
  });

  it("every other failure stays in the banner", () => {
    for (const m of [
      AUTH_ERROR_MESSAGES.alreadyRegistered,
      AUTH_ERROR_MESSAGES.weakPassword,
      AUTH_ERROR_MESSAGES.network,
      AUTH_ERROR_MESSAGES.unknown,
      undefined,
      null,
      "",
    ]) {
      expect(emailFieldErrorFromAuth(m)).toBeNull();
    }
  });
});

describe("birth year vs grade: a gentle hint, never a block", () => {
  it("the usual window for a class year", () => {
    expect(usualBirthYearsForGradYear(2029)).toEqual({ earliest: 2009, latest: 2012 });
  });

  it("the finding's case: born 2008 and in 10th grade (Nov 2026) gets a hint", () => {
    const hint = birthYearGradeHint(2008, 10, NOV_2026);
    expect(hint).toBe("Born in 2008 and in 10th grade? That's unusual, so check both. If they're right, carry on.");
  });

  it.each([2009, 2010, 2011, 2012])("born %i in 10th grade is left alone", (y) => {
    expect(birthYearGradeHint(y, 10, NOV_2026)).toBeNull();
  });

  it.each([
    [2013, 10],
    [2000, 12],
    [2015, 8],
    [2014, 12],
  ])("born %i in grade %i gets a hint", (y, g) => {
    expect(birthYearGradeHint(y, g, NOV_2026)).not.toBeNull();
  });

  it("nothing until both are answered", () => {
    expect(birthYearGradeHint(null, 10, NOV_2026)).toBeNull();
    expect(birthYearGradeHint(2008, null, NOV_2026)).toBeNull();
    expect(birthYearGradYearHint(undefined, 2029)).toBeNull();
  });

  it("class-year form of the same check", () => {
    expect(birthYearGradYearHint(2008, 2029)).toMatch(/class of 2029/);
    expect(birthYearGradYearHint(2011, 2029)).toBeNull();
  });

  it("is never an error and never names the consent rule", () => {
    const hint = birthYearGradeHint(2008, 10, NOV_2026)!;
    expect(hint).not.toMatch(/error|invalid|can't|must|wrong/i);
    expect(hint).not.toMatch(/13|parent|consent/i);
  });
});

describe("the sign-up forms use the field check (source guard)", () => {
  const signup = codeOnly(join(ROOT, "components/auth/signup-flow.tsx"));
  const save = codeOnly(join(ROOT, "components/seeded/onboarding/diagnostic/diagnostic-save.tsx"));
  const hook = codeOnly(join(ROOT, "components/auth/email-field.ts"));

  it("the hook checks on blur (not required, unless a message already shows) and on submit (required)", () => {
    // Blur must not CLEAR a showing message for an empty field: that moved
    // the Continue button out from under the pointer (PR C walk).
    expect(hook).toMatch(/onBlur = useCallback\(\(\) => \{\s*setError\(\(prev\) => emailFieldError\(value, \{ required: prev !== null \}\)\)/);
    expect(hook).toMatch(/emailFieldError\(value, \{ required: true \}\)/);
  });

  it("/signup and /parent-signup: the email field has onBlur, aria-invalid, its own error, and step 1 stops on it", () => {
    expect(signup).toMatch(/useEmailField\(EMAIL_ID\)/);
    expect(signup).toMatch(/<AuthField label="Email" htmlFor=\{EMAIL_ID\} error=\{emailField\.error\}>/);
    expect(signup).toMatch(/onBlur=\{emailField\.onBlur\}/);
    expect(signup).toMatch(/aria-invalid=\{emailField\.error \? true : undefined\}/);
    // continueFromAccount is step 1's submit; it must stop on the field.
    const step1 = signup.slice(signup.indexOf("const continueFromAccount"), signup.indexOf("const continueFromAboutYou"));
    expect(step1).toMatch(/if \(!emailField\.check\(\)\) return;/);
    // The old loose regex check in the banner is gone.
    expect(signup).not.toMatch(/Enter a valid email address/);
  });

  it("/signup: a server refusal of the address sends the person back to step 1's email field", () => {
    // The decision: an address refusal goes back to step index 0 with the
    // field's message; anything else stays (null).
    const refused = signupFailureSendBack(friendlyAuthError({ code: "email_address_invalid", message: "" }));
    expect(refused).toEqual({ step: 0, emailMessage: EMAIL_FIELD_MESSAGES.refused });
    expect(SIGNUP_EMAIL_STEP).toBe(0);
    expect(signupFailureSendBack(AUTH_ERROR_MESSAGES.emailNotAllowed)).toEqual({ step: 0, emailMessage: EMAIL_FIELD_MESSAGES.notAllowed });
    for (const m of [AUTH_ERROR_MESSAGES.rateLimited, AUTH_ERROR_MESSAGES.alreadyRegistered, AUTH_ERROR_MESSAGES.unknown, undefined]) {
      expect(signupFailureSendBack(m)).toBeNull();
    }
    // The wiring: the failure branch of submit asks it FIRST and acts on it
    // unconditionally — exactly this block, before the banner fallback.
    // (Independent review: disabling the block used to pass every test.)
    const submit = signup.slice(signup.indexOf("const submit = async"));
    const failure = submit.slice(submit.indexOf("if (!result.ok) {"));
    expect(failure).toMatch(
      /^if \(!result\.ok\) \{\s*const sendBack = signupFailureSendBack\(result\.error\);\s*if \(sendBack\) \{\s*focusEmailOnStep\.current = true;\s*emailField\.setServerError\(sendBack\.emailMessage, \{ focus: false \}\);\s*setStep\(sendBack\.step\);\s*return;\s*\}\s*setError\(signupErrorMessage\(result\.error \?\? AUTH_ERROR_MESSAGES\.unknown, GOOGLE_AUTH_ENABLED\)\);/
    );
    // And the step effect moves focus to the email field for it.
    expect(signup).toMatch(/if \(focusEmailOnStep\.current\) \{\s*focusEmailOnStep\.current = false;\s*document\.getElementById\(EMAIL_ID\)\?\.focus\(\);/);
  });

  it("the onboarding sign-up step (player and parent): same field check, same server mapping", () => {
    expect(save.match(/useEmailField\(id\("email"\)\)/g)).toHaveLength(2);
    expect(save.match(/error=\{emailField\.error\}/g)).toHaveLength(2);
    expect(save.match(/onBlur=\{emailField\.onBlur\}/g)).toHaveLength(2);
    expect(save.match(/if \(!emailField\.check\(\)\) return;/g)).toHaveLength(2);
    expect(save.match(/emailFieldErrorFromAuth\(result\.error\)/g)).toHaveLength(2);
    expect(save).not.toMatch(/Enter a valid email address/);
  });

  it("/signup's name placeholder describes the field instead of looking like a person's name", () => {
    const placeholder = signup.match(/placeholder=\{isParentSignup \? "([^"]+)" : "([^"]+)"\}/);
    expect(placeholder).not.toBeNull();
    expect(placeholder![1]).toBe("First and last name");
    expect(placeholder![2]).toBe("First name and last initial");
    // No sample name in the field's hint either.
    expect(signup).not.toMatch(/like [A-Z][a-z]+ [A-Z]\./);
  });

  it("/signup shows the birth-year/grade hint without blocking Continue", () => {
    expect(signup).toMatch(/birthYearGradeHint\(birthYear, grade\)/);
    const step2 = signup.slice(signup.indexOf("const continueFromAboutYou"), signup.indexOf("const rowGender"));
    expect(step2).not.toMatch(/ageHint/);
  });
});
