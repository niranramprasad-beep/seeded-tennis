"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { signInWithGoogle } from "@/lib/auth";
import { GOOGLE_AUTH_ENABLED } from "@/lib/config/auth";
import { SeededButton } from "@/components/seeded/ui/button";

// The shared shell for /login, /signup, /parent-signup, /reset-password and
// /auth/complete — Board 21 of docs/DESIGN_MOCKUP_SPEC_V2.md: a centred card
// at most 440px wide, radius 16, padding 36 (24 on small phones), white
// surface with a hairline border, on the page background. H1 + one-line sub,
// then Google (only with the flag on), an "or with email" divider, then the
// form. The slim logo-only header is AppShell's job, not this file's.
//
// One component rather than five copies, because the screens disagreed
// before: different card widths, different error treatments, and a Google
// button on none of them. The measurements live here once.

/**
 * The one input style for every auth screen (and the pre-auth onboarding
 * signup, which imports it).
 *
 * 44px tall, radius 8, 1px input border, 16px text. 16px is not a style
 * choice: iOS Safari zooms the whole page when you focus an input whose text
 * is under 16px. The focus ring is design-system rule 8 — a 2px outline,
 * offset 2, in the focus token (court green on light, lime on dark).
 */
export const authInputClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3.5 text-base text-ink " +
  "placeholder:text-stone-light focus:outline-none focus-visible:outline " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "aria-[invalid=true]:border-error disabled:opacity-60";

/** The id a field's hint or inline error is rendered under, so the input can
 * point at it with aria-describedby. */
const fieldHintId = (htmlFor: string) => `${htmlFor}-hint`;

/** aria-describedby for an input inside AuthField: its hint/error, plus any
 * extra ids (the form's error banner, say). Undefined when there is none. */
export function describedBy(
  htmlFor: string,
  opts: { hint?: boolean; extra?: Array<string | false | null | undefined> } = {}
): string | undefined {
  const ids = [opts.hint ? fieldHintId(htmlFor) : null, ...(opts.extra ?? [])].filter(
    Boolean
  ) as string[];
  return ids.length ? ids.join(" ") : undefined;
}

/** Label above, 13px/500 in stone; an optional action (e.g. "Forgot it?") at
 * the right of the label row; hint or error below, under fieldHintId(). */
export function AuthField({
  label,
  htmlFor,
  help,
  error,
  labelAction,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: ReactNode;
  error?: string | null;
  labelAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-stone">
          {label}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={fieldHintId(htmlFor)} className="mt-1.5 text-sm text-error-strong">
          {error}
        </p>
      ) : help ? (
        <p id={fieldHintId(htmlFor)} className="mt-1.5 text-[13px] leading-snug text-stone">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The error banner. Its text must come from friendlyAuthError (lib/auth.ts)
 * or be hand-written — never a raw Supabase message.
 *
 * Focus moves here whenever a NEW message appears, so a keyboard or
 * screen-reader user who pressed "Sign in" lands on the reason it failed
 * instead of being left on a button that seemed to do nothing.
 */
export function AuthError({ message, id = "auth-error" }: { message: string; id?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [message]);
  return (
    <p
      ref={ref}
      id={id}
      role="alert"
      tabIndex={-1}
      className="mb-5 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm leading-snug text-error-strong focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {message}
    </p>
  );
}

/** A calm success line (email confirmed, link sent again). */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="mb-5 rounded-lg border border-grass/30 bg-grass-50 px-4 py-3 text-sm leading-snug text-grass"
    >
      {children}
    </p>
  );
}

/** The card's H1 id, so a multi-step form can move focus to the new title
 * when the step changes. */
export const AUTH_TITLE_ID = "auth-title";

export function AuthCard({
  title,
  subtitle,
  error,
  errorId,
  notice,
  google,
  eyebrow,
  footer,
  busy,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  error?: string | null;
  errorId?: string;
  notice?: ReactNode;
  /** Renders the Google button and the "or with email" divider above the
   * form. Omit on screens where Google makes no sense (finishing a Google
   * signup, resetting a password). */
  google?: { next?: string; label?: string };
  /** Small line above the title — the signup step counter. */
  eyebrow?: ReactNode;
  /** Below the card, centred: "New here? Create a free account". */
  footer?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    // Vertically centred in the space below the slim header. bg-cream is
    // the page background token, so the white card reads as a card in both
    // light and dark mode.
    <div className="flex min-h-[calc(100vh-73px)] w-full justify-center bg-cream px-4 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-[440px]">
        <div
          className="rounded-2xl border border-line bg-card p-6 shadow-soft sm:p-9"
          aria-busy={busy || undefined}
        >
          {eyebrow && <div className="mb-4">{eyebrow}</div>}
          <h1
            id={AUTH_TITLE_ID}
            tabIndex={-1}
            className="font-seeded text-[26px] font-semibold leading-tight tracking-tight text-ink focus:outline-none sm:text-[28px]"
          >
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-[15px] leading-normal text-stone">{subtitle}</p>}

          <div className="mt-6">
            {google && GOOGLE_AUTH_ENABLED && (
              <>
                <GoogleButton next={google.next} label={google.label} />
                <GoogleDivider label="or with email" />
              </>
            )}
            {error && <AuthError message={error} id={errorId} />}
            {notice}
            {children}
          </div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-stone">{footer}</div>}
      </div>
    </div>
  );
}

interface GoogleButtonProps {
  next?: string;
  label?: string;
  /** Runs just before the browser leaves for Google — the onboarding
   * diagnostic keeps its answers in sessionStorage here, so they survive
   * the redirect and are applied on /auth/complete. */
  onStart?: () => void;
}

/**
 * "Continue with Google" — a SECONDARY button (Board 21: one primary per
 * screen, and that is the email form's submit).
 *
 * Renders only when NEXT_PUBLIC_GOOGLE_AUTH_ENABLED is exactly "true", and
 * the check is HERE rather than only in AuthCard — the pre-auth onboarding
 * renders this directly, and with the check one level up it showed the
 * button on /signup with the flag unset. Caught in a 375px screenshot. A
 * flag that only works through one caller is not a flag.
 *
 * The flag decides whether a button appears, not whether anything is
 * permitted — the real gate is the Google provider being enabled in Supabase
 * Auth. With the flag on and the provider off, this renders and Supabase
 * refuses, which is why turning the flag on is the LAST step of enabling
 * Google sign-in.
 *
 * On failure it shows the message inline rather than navigating: the user is
 * still on the page they started from, and sending them somewhere else to
 * read an error would lose whatever they had typed.
 */
export function GoogleButton({ next, label, onStart }: GoogleButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!GOOGLE_AUTH_ENABLED) return null;

  const start = async () => {
    setError(null);
    setLoading(true);
    onStart?.();
    const result = await signInWithGoogle(next);
    // On success the browser is already navigating to Google; leaving the
    // button in its loading state is correct, not a stuck spinner.
    if (!result.ok) {
      // Already mapped by friendlyAuthError in lib/auth.ts.
      setError(result.error ?? "Couldn't start Google sign-in. Try again.");
      setLoading(false);
    }
  };

  return (
    <>
      <SeededButton
        type="button"
        variant="secondary"
        onClick={start}
        loading={loading}
        className="w-full"
      >
        {!loading && <GoogleMark />}
        {label ?? "Continue with Google"}
      </SeededButton>
      {error && (
        <p role="alert" className="mt-2 text-sm text-error-strong">
          {error}
        </p>
      )}
    </>
  );
}

/** The divider between Google and the email form. Rendered only alongside
 * the button, so it cannot appear on its own with the flag off. */
export function GoogleDivider({ label = "or" }: { label?: string } = {}) {
  if (!GOOGLE_AUTH_ENABLED) return null;
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      <span className="text-[13px] text-stone">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Google's mark, inline. Not an <img> from a Google URL: that would be a
 * third-party request on a page we tell the CSP to keep to 'self', and it
 * would leak a page view to Google before anyone clicked anything. The four
 * fills are Google's brand colours and are the one deliberate exception to
 * "tokens only, never hex" — the mark must not change with the theme. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.02-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** Text link in the auth palette. 44px tall on phones (touch), 24px from sm
 * up (WCAG 2.5.8), so it is a real target without bloating desktop rows. */
export const authLinkClass =
  "inline-flex min-h-11 items-center rounded-sm font-medium text-grass underline-offset-4 " +
  "hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-focus sm:min-h-6";

export function AuthFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={authLinkClass}>
      {children}
    </Link>
  );
}

/** "By creating an account you agree to the Terms and Privacy policy." */
export function AuthLegalLine({ prefix }: { prefix: string }) {
  return (
    <p className="mt-4 text-center text-[13px] leading-normal text-stone">
      {prefix}{" "}
      <Link
        href="/terms"
        className="font-medium text-ink underline underline-offset-2 hover:text-grass"
      >
        Terms
      </Link>{" "}
      and{" "}
      <Link
        href="/privacy"
        className="font-medium text-ink underline underline-offset-2 hover:text-grass"
      >
        Privacy policy
      </Link>
      .
    </p>
  );
}
