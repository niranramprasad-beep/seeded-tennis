"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { Player, PlayerGender } from "@/lib/types";
import { getCurrentSchoolYear } from "@/lib/time";
import { SeededButton } from "@/components/seeded/ui/button";

const inputClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30";

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
// migration 014_profile_fields_and_deletion.sql). A local draft is kept so
// "Save changes" commits everything at once rather than autosaving every
// keystroke.
export function ProfileCard({
  player,
  onSave,
}: {
  player: Player;
  onSave: (patch: Partial<Player>) => void;
}) {
  const [name, setName] = useState(player.name);
  const [graduationYear, setGraduationYear] = useState(player.graduationYear);
  const [gender, setGender] = useState<PlayerGender>(player.gender);
  const [homeArea, setHomeArea] = useState(player.homeArea ?? "");
  const [utrProfileLink, setUtrProfileLink] = useState(player.utrProfileLink ?? "");
  const [gpa, setGpa] = useState(player.gpa != null ? String(player.gpa) : "");
  const [saved, setSaved] = useState(false);

  const years = gradYearOptions();
  // The player's real stored grad year might fall outside the generated
  // forward-looking window (e.g. a senior already graduated) — always
  // include it so the <select> never silently jumps to a different value.
  if (!years.includes(graduationYear)) years.unshift(graduationYear);

  const save = () => {
    const parsedGpa = gpa.trim() === "" ? null : Number(gpa);
    onSave({
      name: name.trim(),
      graduationYear,
      gender,
      homeArea: homeArea.trim(),
      utrProfileLink: utrProfileLink.trim(),
      gpa: parsedGpa != null && !Number.isNaN(parsedGpa) ? parsedGpa : null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Player profile</h2>
      <p className="mt-1 text-sm text-stone">Changes here update your fit report and plan right away.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">Full name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
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
            placeholder="Bethesda, MD"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">UTR profile link</span>
          <input
            className={inputClass}
            value={utrProfileLink}
            onChange={(e) => setUtrProfileLink(e.target.value)}
            placeholder="app.utrsports.net/profiles/..."
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone">Unweighted GPA</span>
          <input
            className={inputClass}
            value={gpa}
            onChange={(e) => setGpa(e.target.value)}
            inputMode="decimal"
            placeholder="3.7"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-grass">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        <SeededButton onClick={save}>Save changes</SeededButton>
      </div>
    </div>
  );
}
