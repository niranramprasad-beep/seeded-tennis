"use client";

import { useCallback, useState } from "react";
import { emailFieldError } from "@/lib/signup-checks";

/**
 * The email field's own error, for every sign-up form (final-check A6).
 *
 * - On blur: a non-empty address that is not shaped like one is flagged
 *   under the field at once, not three steps later.
 * - While the message shows, it is re-checked on every keystroke, so it
 *   clears the moment the address is fixed (and never appears mid-typing
 *   before the first blur).
 * - `check()` is for Continue / Create: it also flags an empty field, moves
 *   focus to the input, and returns false so the form stops there.
 * - `setServerError()` puts a server refusal (friendlyAuthError's
 *   invalidEmail / emailNotAllowed, mapped by emailFieldErrorFromAuth) on
 *   the field, for the step that sends the person back to it.
 *
 * The input gets `aria-invalid` and points at the message with
 * aria-describedby (AuthField renders it under `${id}-hint`).
 */
export function useEmailField(inputId: string) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const focus = useCallback(() => {
    // After the render that shows the field (a step change) has committed.
    requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  }, [inputId]);

  const onChange = useCallback(
    (next: string) => {
      setValue(next);
      // Only re-check once a message is already showing.
      setError((prev) => (prev ? emailFieldError(next, { required: true }) : prev));
    },
    []
  );

  const onBlur = useCallback(() => {
    // Once a message is showing, blur keeps the stricter (required) check:
    // emptying the field and then pressing Continue used to clear the
    // message on blur, the button jumped up under the pointer, and the
    // click landed on nothing (caught on the PR C walk).
    setError((prev) => emailFieldError(value, { required: prev !== null }));
  }, [value]);

  const check = useCallback((): boolean => {
    const message = emailFieldError(value, { required: true });
    setError(message);
    if (message) focus();
    return message === null;
  }, [value, focus]);

  /** `focus: false` when the caller moves focus itself (a step change). */
  const setServerError = useCallback(
    (message: string, opts: { focus?: boolean } = {}) => {
      setError(message);
      if (opts.focus !== false) focus();
    },
    [focus]
  );

  return { value, error, onChange, onBlur, check, setServerError, focus };
}
