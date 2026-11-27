// Catalog phase 1: programs imported from official roster pages (migration
// 048), shown on /schools only when NEXT_PUBLIC_CATALOG_PHASE1_ENABLED is
// "true" (lib/config/catalog.ts). A server component with no client JS.
//
// What it shows per program, and nothing more:
//   * school, gender, division, conference — from the roster file;
//   * the final-year line, always with the roster's season and the date it
//     was read, plus a plain note when that roster is last season's;
//   * the team range with its source and date, or "Level not rated yet".
// It shows no fit band. Imported programs reach fit math only through
// bandableRange() in lib/catalog/programs.ts, and only once the owner has
// entered a sourced range; merging rated ones into the banded list above is
// a later phase. No player name exists in the data to show.

import { withoutLegacyDuplicates } from "@/lib/catalog/legacy-match";
import { finalYearDisplay, rangeDisplay, type ImportedProgram } from "@/lib/catalog/programs";
import { loadImportedPrograms } from "@/lib/db/programs";
import { getSchoolsLite } from "@/lib/db/schools";

function byConference(programs: ImportedProgram[]): [string, ImportedProgram[]][] {
  const groups = new Map<string, ImportedProgram[]>();
  for (const p of programs) groups.set(p.conference, [...(groups.get(p.conference) ?? []), p]);
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function ProgramRow({ program, now }: { program: ImportedProgram; now: Date }) {
  const finalYear = finalYearDisplay(program, now);
  const range = rangeDisplay(program, now);
  return (
    <li className="border-t-[0.5px] border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-medium text-ink">
          {program.school}{" "}
          <span className="font-normal text-stone">
            · {program.gender === "women" ? "Women's" : "Men's"} · {program.division}
          </span>
        </p>
        {program.rosterUrl ? (
          <a
            href={program.rosterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-grass underline-offset-2 hover:underline"
          >
            Roster page
          </a>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink">{finalYear.text}</p>
      {finalYear.notes.map((note) => (
        <p key={note} className="mt-0.5 text-xs text-stone">
          {note}
        </p>
      ))}
      <p className={range.rated ? "mt-1 text-sm text-ink" : "mt-1 text-sm text-stone"}>{range.headline}</p>
      {range.sourceLine ? (
        <p className="mt-0.5 text-xs text-stone">
          {range.sourceLine}
          {range.sourceUrl ? (
            <>
              {" · "}
              <a href={range.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                source
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

export async function ImportedProgramsSection() {
  const [imported, legacy] = await Promise.all([loadImportedPrograms(), getSchoolsLite()]);
  // A team already in the main list above (Middlebury, Johns Hopkins, the
  // Ivies...) is not listed a second time here.
  const programs = withoutLegacyDuplicates(imported, legacy);
  const alreadyListed = imported.length - programs.length;
  if (programs.length === 0) return null;
  const now = new Date();

  return (
    <section aria-labelledby="imported-programs-heading" className="mt-14">
      <h2 id="imported-programs-heading" className="text-2xl font-light tracking-tight text-ink">
        More programs, from official roster pages
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone">
        A preview. These come from each program&apos;s own roster page. A team&apos;s UTR level is
        added one program at a time, with its source and date; until then it reads &ldquo;Level not
        rated yet&rdquo; and the program gets no fit. &ldquo;Seniors&rdquo; counts every player
        in their final season on that roster, including graduate students and 5th-years.
        {alreadyListed > 0
          ? ` ${alreadyListed} team${alreadyListed === 1 ? " is" : "s are"} already in the list above and ${alreadyListed === 1 ? "isn't" : "aren't"} repeated here.`
          : null}
      </p>

      <div className="mt-6 space-y-4">
        {byConference(programs).map(([conference, list]) => (
          <details key={conference} className="rounded-xl border-[0.5px] border-line bg-card px-4 py-3">
            <summary className="cursor-pointer text-ink">
              {conference} <span className="text-stone">({list.length})</span>
            </summary>
            <ul className="mt-2">
              {list.map((p) => (
                <ProgramRow key={p.id} program={p} now={now} />
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
