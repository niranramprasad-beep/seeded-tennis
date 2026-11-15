"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { signInWithGoogle } from "@/lib/auth";
import { GOOGLE_AUTH_ENABLED } from "@/lib/config/auth";
import { cn } from "@/lib/utils";

// The shared shell for /login, /signup and /auth/complete, per
// docs/DESIGN_MOCKUP_SPEC.md: same header and background as pricing, a
// centred ~420px white card, H2 + subline, Google first, then an "or"
// divider, then the form.
//
// One component rather than three copies, because the three screens
// disagreed before: different card widths, different error treatments, and a
// Google button on none of them. The spec's measurements live here once.

/**
 * The one input style for every auth screen.
 *
 * /login and /signup disagreed on all four of height, radius, border and
 * text size — 44px/radius-6/1px/16px here, 48px/radius-12/0.5px/14px on
 * signup — so two screens one click apart looked like two products. This is
 * signup's rounder, taller shape (the one that reads better) at login's
 * 16px text, which is not a style choice: iOS Safari zooms the whole page
 * when you focus an input whose text is under 16px, and signup's 14px was
 * doing exactly that on a phone.
 */
export const authInputClass =
  "h-12 w-full rounded-xl border border-input bg-card px-4 text-base text-ink " +
  "placeholder:text-stone-light focus:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-grass/40 focus-visible:ring-offset-1";

export function AuthField({
  label,
  htmlFor,
  help,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-stone">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-error">{error}</p>
      ) : help ? (
        <p className="mt-1.5 text-xs text-stone">{help}</p>
      ) : null}
    </div>
  );
}

/** The spec's error banner: "always says what's safe + Try again". */
export function AuthError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg border border-error/40 bg-error-bg px-4 py-3 text-sm text-error"
    >
      {message}
    </p>
  );
}

export function AuthCard({
  title,
  subtitle,
  error,
  google,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  error?: string | null;
  /** Renders the Google button and the "or" divider above the form. Omit on
   * screens where Google makes no sense (finishing a Google signup). */
  google?: { next?: string; label?: string };
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Vertically centred in the space below the 73px header, matching
    // /signup. /login used to sit at `py-12` from the top while /signup
    // centred itself, so moving between them jumped the card up the screen.
    <div className="mx-auto flex w-full max-w-[420px] flex-col justify-center px-5 py-12 min-h-[calc(100vh-73px)]">
      <div className="rounded-xl border border-line bg-card p-6 shadow-soft">
        <h1 className="font-seeded text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] leading-[1.5] text-stone">{subtitle}</p>}

        <div className="mt-5">
          {error && <AuthError message={error} />}
          {google && GOOGLE_AUTH_ENABLED && (
            <>
              <GoogleButton next={google.next} label={google.label} />
              <GoogleDivider />
            </>
          )}
          {children}
        </div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-stone">{footer}</div>}
    </div>
  );
}

/**
 * "Continue with Google".
 *
 * Renders only when NEXT_PUBLIC_GOOGLE_AUTH_ENABLED is exactly "true", and
 * the check is HERE rather than only in AuthCard — components/auth/
 * signup-flow.tsx renders this directly, and with the check one level up it
 * showed the button on /signup with the flag unset. Caught in a 375px
 * screenshot. A flag that only works through one caller is not a flag.
 *
 * The
 * flag decides whether a button appears, not whether anything is permitted —
 * the real gate is the Google provider being enabled in Supabase Auth. With
 * the flag on and the provider off, this renders and Supabase refuses, which
 * is why turning the flag on is the LAST step of enabling Google sign-in.
 *
 * On failure it shows the message inline rather than navigating: the user is
 * still on the page they started from, and sending them somewhere else to
 * read an error would lose whatever they had typed.
 */
export function GoogleButton({ next, label }: { next?: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!GOOGLE_AUTH_ENABLED) return null;

  const start = async () => {
    setError(null);
    setLoading(true);
    const result = await signInWithGoogle(next);
    // On success the browser is already navigating to Google; leaving the
    // button in its loading state is correct, not a stuck spinner.
    if (!result.ok) {
      setError(result.error ?? "Couldn't start Google sign-in. Try again.");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className={cn(
          "flex min-h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-input",
          "bg-card text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/40 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <GoogleMark />
        )}
        {label ?? "Continue with Google"}
      </button>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </>
  );
}

/** The "or" between Google and the email form. Rendered only alongside the
 * button, so it cannot appear on its own with the flag off. */
export function GoogleDivider() {
  if (!GOOGLE_AUTH_ENABLED) return null;
  return (
    <div className="my-4 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      <span className="text-[13px] text-stone">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Google's mark, inline. Not an <img> from a Google URL: that would be a
 * third-party request on a page we tell the CSP to keep to 'self', and it
 * would leak a page view to Google before anyone clicked anything. */
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

export function AuthFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-grass underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
