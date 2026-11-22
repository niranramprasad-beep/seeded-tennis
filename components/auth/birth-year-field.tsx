"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SHOW_ALL_BIRTH_YEARS_LABEL } from "@/lib/grade-birth-year";
import { AuthField, authInputClass, authLinkClass, describedBy } from "./auth-card";

// The birth-year <select> on /signup, /parent-signup and /auth/complete.
//
// Once a grade is picked the list shows only the years that are realistic
// for it (lib/grade-birth-year.ts). Two things keep that honest:
//   - "Show all years" lifts the filter: a birth year is write-once and the
//     under-13 consent rule runs on it, so a real year outside the usual
//     range must never be impossible to enter.
//   - When a grade change clears a year already picked, the reason is said
//     out loud (`notice`, a polite live region), never a silent change.

export function BirthYearField({
  id,
  label,
  help,
  value,
  onChange,
  years,
  filtered,
  onShowAll,
  notice,
  extraDescribedBy = [],
}: {
  id: string;
  label: string;
  help?: ReactNode;
  value: number | null;
  onChange: (year: number | null) => void;
  /** Already filtered by the caller (lib/grade-birth-year.ts birthYearChoices). */
  years: readonly number[];
  /** True while `years` is the grade's range rather than every year. */
  filtered: boolean;
  onShowAll: () => void;
  notice: string | null;
  extraDescribedBy?: Array<string | false | null | undefined>;
}) {
  const noticeId = `${id}-notice`;
  return (
    <div>
      <AuthField
        label={label}
        htmlFor={id}
        help={help}
        labelAction={
          filtered ? (
            <button type="button" onClick={onShowAll} className={cn(authLinkClass, "text-sm")}>
              {SHOW_ALL_BIRTH_YEARS_LABEL}
            </button>
          ) : undefined
        }
      >
        <select
          id={id}
          name="birth-year"
          className={authInputClass}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          aria-describedby={describedBy(id, {
            hint: Boolean(help),
            extra: [...extraDescribedBy, notice && noticeId],
          })}
        >
          <option value="">Select a year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </AuthField>
      {/* Polite: it reports what just happened to the field, not an error. */}
      <p
        id={noticeId}
        aria-live="polite"
        className={cn("mt-1.5 text-[13px] leading-snug text-stone", !notice && "sr-only")}
      >
        {notice ?? ""}
      </p>
    </div>
  );
}
