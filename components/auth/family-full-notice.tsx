"use client";

import { SeededButton } from "@/components/seeded/ui/button";

/**
 * Migration 045: join_family() answered "family_full" — the family already
 * holds 4 players or 2 parents. The account was still created and is signed
 * in, so this is a calm stop, never a failed sign-up: say why, and let them
 * carry on into the app.
 */
export function FamilyFullNotice({
  message,
  onContinue,
}: {
  message: string;
  onContinue: () => void;
}) {
  return (
    <div>
      <p role="status" className="m-0 text-[15px] leading-relaxed text-ink">
        {message}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-stone">
        Your account is ready. You can use Seeded on your own in the meantime.
      </p>
      <SeededButton type="button" variant="primary" className="mt-5 w-full" onClick={onContinue}>
        Continue
      </SeededButton>
    </div>
  );
}
