// Migration 043's refusal, in one dependency-free module.
//
// join_family / approve_family_join / grant_parent_consent raise errcode
// 42501 with this exact message when the CALLER is a parent account that has
// not proven its email. It lives here, not in lib/auth.ts or
// lib/db/email-verification.ts, because both of those and
// lib/db/family-join.ts need it and they import each other: a leaf module
// keeps the constant out of an import cycle (where it could be read before
// it is initialised).

/** The stable message 043's RPCs raise (errcode 42501). */
export const VERIFY_EMAIL_REQUIRED = "verify_email_required";

/** The one sentence the UI shows for it. */
export const VERIFY_EMAIL_REQUIRED_MESSAGE = "Confirm your email first. We'll send you a link.";

/** True when an error from a family RPC means "this parent must verify their
 * email first". Accepts a PostgrestError, an Error, or a string. */
export function isEmailVerifyRequired(error: unknown): boolean {
  if (!error) return false;
  const text =
    typeof error === "string"
      ? error
      : typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  return text.toLowerCase().includes(VERIFY_EMAIL_REQUIRED);
}
