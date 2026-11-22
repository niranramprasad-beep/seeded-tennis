"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { Player, PlayerGender } from "@/lib/types";
import { getCurrentSchoolYear } from "@/lib/time";
import { validateUtrProfileLink } from "@/lib/utr-profile-link";
import {
  TOURNAMENTS_PLANNED_LABEL,
  TOURNAMENTS_PLANNED_MAX,
  parseTournamentsPlannedText,
  plannedThisSeason,
  stampTournamentsPlanned,
} from "@/lib/tournaments-planned";
import { SeededButton } from "@/components/seeded/ui/button";
import { PROFILE_SAVE_FAILED, parseGpaText, profileNameError } from "@/lib/profile-fields";

const inputClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-focus";

function gradYearOptions(): number[] {
  const start = getCurrentSchoolYear();
  return Array.from({ length: 8 }, (_, i) => start + i);
}

const TEAM_OPTIONS: { value: PlayerGender; label: string }[] = [
  { value: "female", label: "Women's" },
  { value: "male", label: "Men's" },
];

// Pixel-exact to the mockup's "Player profile" card: Full name / High
// school grad year / Team / Home area / UTR profile link / Unweighted GPA,
// all real fields on the `profiles` row (name/graduation_year/gender are
// pre-existing columns; home_area/utr_profile_link/gpa are new in
// migration 014_profile_fields_and_deletion.sql). Plus one field the
// mockup does not show: "Tournaments planned this season" (players only,
// optional — blank is "Not set"), the only place after onboarding to set
// the count migration 049 stopped inventing (docs/DECISIONS.md). A local draft is kept so
// "Save changes" commits everything at once rather than autosaving every
// keystroke.
export function ProfileCard({
  player,
  onSave,
}: {
  player: Player;
  /** Resolves true only when the write really succeeded. */
  onSave: (patch: Partial<Player>) => Promise<boolean>;
}) {
  const [name, setName] = useState(player.name);
  const [graduationYear, setGraduationYear] = useState(player.graduationYear);
  const [gender, setGender] = useState<PlayerGender>(player.gender);
  const [homeArea, setHomeArea] = useState(player.homeArea ?? "");
  const [utrProfileLink, setUtrProfileLink] = useState(player.utrProfileLink ?? "");
  const [utrLinkError, setUtrLinkError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [gpa, setGpa] = useState(player.gpa != null ? String(player.gpa) : "");
  const [gpaError, setGpaError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A count saved for an earlier season shows blank ("Not set"): it was
  // a plan for a season that is over (049's tournaments_planned_season).
  const [tournamentsPlanned, setTournamentsPlanned] = useState(() => {
    const current = plannedThisSeason(player);
    return current != null ? String(current) : "";
  });
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  const isPlayer = player.role === "player";
  const [saved, setSaved] = useState(false);

  const years = gradYearOptions();
  // The player's real stored grad year might fall outside the generated
  // forward-looking window (e.g. a senior already graduated) — always
  // include it so the <select> never silently jumps to a different value.
  if (!years.includes(graduationYear)) years.unshift(graduationYear);

  const save = async () => {
    setSaved(false);
    setSaveError(null);
    // QA sweep H2: a blank name used to save, and the next load put the login
    // email in its place — which then signed the coach email.
    const nameProblem = profileNameError(name);
    setNameError(nameProblem);
    const linkCheck = validateUtrProfileLink(utrProfileLink);
    setUtrLinkError(linkCheck.valid ? null : linkCheck.error);
    const planned = parseTournamentsPlannedText(tournamentsPlanned);
    setTournamentsError(isPlayer ? planned.error : null);
    // QA sweep H3: 5.7 went to the database, failed its 0–5 CHECK as a raw
    // 500, and the field silently reverted on the next load.
    const parsedGpa = parseGpaText(gpa);
    setGpaError(parsedGpa.error);
    if (nameProblem || !linkCheck.valid || (isPlayer && planned.error) || parsedGpa.error) return;

    setSaving(true);
    const ok = await onSave({
      name: name.trim(),
      graduationYear,
      gender,
      homeArea: homeArea.trim(),
      utrProfileLink: linkCheck.normalized ?? "",
      gpa: parsedGpa.value,
      // Blank = "Not set" (null). A parent's own row is left alone.
      // Stamped with the season it is for; both NULL when cleared.
      ...(isPlayer ? stampTournamentsPlanned(planned.value) : {}),
    });
    setSaving(false);
    // "Saved" only when the write really landed.
    if (!ok) {
      setSaveError(PROFILE_SAVE_FAILED);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="rounded-card border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Player profile</h2>
      <p className="mt-1 text-[15px] text-stone">Changes here update your fit report and plan right away.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">Full name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            autoComplete="name"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "settings-name-error" : undefined}
          />
          {nameError && (
            <p id="settings-name-error" className="mt-1.5 text-sm text-error">
              {nameError}
            </p>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">High school grad year</span>
          <select
            className={inputClass}
            value={graduationYear}
            onChange={(e) => setGraduationYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">Team</span>
          <select
            className={inputClass}
            value={gender}
            onChange={(e) => setGender(e.target.value as PlayerGender)}
          >
            {TEAM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">Home area</span>
          <input
            className={inputClass}
            value={homeArea}
            onChange={(e) => setHomeArea(e.target.value)}
            placeholder="City, state"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">UTR profile link</span>
          <input
            className={inputClass}
            value={utrProfileLink}
            onChange={(e) => {
              setUtrProfileLink(e.target.value);
              if (utrLinkError) setUtrLinkError(null);
            }}
            onBlur={() => setUtrLinkError(validateUtrProfileLink(utrProfileLink).error)}
            placeholder="app.utrsports.net/profiles/..."
            aria-invalid={utrLinkError ? true : undefined}
          />
          {utrLinkError && <p className="mt-1.5 text-sm text-error">{utrLinkError}</p>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">Unweighted GPA</span>
          <input
            className={inputClass}
            value={gpa}
            onChange={(e) => {
              setGpa(e.target.value);
              if (gpaError) setGpaError(null);
            }}
            inputMode="decimal"
            placeholder="0.0 to 5.0"
            aria-invalid={gpaError ? true : undefined}
            aria-describedby={gpaError ? "settings-gpa-error" : undefined}
          />
          {gpaError && (
            <p id="settings-gpa-error" className="mt-1.5 text-sm text-error">
              {gpaError}
            </p>
          )}
        </label>
        {isPlayer && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-stone">{TOURNAMENTS_PLANNED_LABEL}</span>
            <input
              className={inputClass}
              value={tournamentsPlanned}
              onChange={(e) => {
                setTournamentsPlanned(e.target.value);
                if (tournamentsError) setTournamentsError(null);
              }}
              inputMode="numeric"
              placeholder={`Not set · 0 to ${TOURNAMENTS_PLANNED_MAX}`}
              aria-invalid={tournamentsError ? true : undefined}
              aria-describedby={tournamentsError ? "settings-tournaments-error" : undefined}
            />
            {tournamentsError && (
              <p id="settings-tournaments-error" className="mt-1.5 text-sm text-error">
                {tournamentsError}
              </p>
            )}
          </label>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {saveError && (
          <span role="alert" className="text-sm text-error">
            {saveError}
          </span>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-grass">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        <SeededButton onClick={() => void save()} loading={saving}>
          Save changes
        </SeededButton>
      </div>
    </div>
  );
}
