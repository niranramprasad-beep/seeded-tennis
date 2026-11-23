// The roster page sections (migration 054, Niran's decision 2026-11-22):
// the official roster by name and the coaching staff, from the owner's sheet.
// Every number and every address shows where it came from and when.
// No hooks: renders inside the client school page and on the server alike.

import { Mail, Users } from "lucide-react";
import { formatIsoDate } from "@/lib/catalog/programs";
import type { ProgramRosterPage, RosterPlayer, StaffMember } from "@/lib/db/roster";
import { cn, plural } from "@/lib/utils";

function newestDate(dates: string[]): string | null {
  return dates.length ? [...dates].sort().at(-1)! : null;
}

function UtrCell({ p }: { p: RosterPlayer }) {
  if (p.utr === null) return <span className="text-stone">Not tracked</span>;
  const value = p.utr.toFixed(2);
  return (
    <a
      href={p.utrProfileUrl!}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("font-mono tabular-nums underline-offset-2 hover:underline", p.utrReliable ? "text-ink" : "text-stone")}
      title={p.utrReliable ? "Reliable singles UTR, from the player's UTR profile" : "Rating UTR marks as not yet reliable"}
    >
      {value}
      {p.utrReliable ? null : <span className="ml-1 font-sans text-xs">(not reliable)</span>}
    </a>
  );
}

export function SchoolRosterCard({
  page,
  rosterUrl,
  seasonLabel = "2026-27",
}: {
  page: ProgramRosterPage;
  rosterUrl?: string | null;
  seasonLabel?: string;
}) {
  if (page.players.length === 0) return null;
  const read = newestDate(page.players.map((p) => p.readDate));
  const reliable = page.players.filter((p) => p.utrReliable).length;
  return (
    <section aria-labelledby="roster-heading" className="mt-5 rounded-card border border-line bg-card p-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-grass" aria-hidden />
          <h2 id="roster-heading" className="text-base font-semibold text-ink">
            Roster · {seasonLabel}
          </h2>
        </div>
        <p className="text-sm text-stone">
          {plural(page.players.length, "player", "players")} · {reliable} with a reliable UTR
        </p>
      </div>

      <div className="mt-4 hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-3 border-b border-line pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-stone sm:grid">
        <span>Player</span>
        <span>Class</span>
        <span>Singles UTR</span>
        <span>Hometown</span>
      </div>
      <ul>
        {page.players.map((p) => (
          <li
            key={p.name}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line py-2.5 text-sm last:border-b-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] sm:items-center"
          >
            <span className="min-w-0 truncate font-medium text-ink">{p.name}</span>
            <span className="text-right text-stone sm:order-none sm:text-left">
              {p.classLabel ?? "Not tracked"}
              {p.gradYear ? <span className="text-xs"> · {p.gradYear}</span> : null}
            </span>
            <span className="sm:order-none">
              <UtrCell p={p} />
            </span>
            <span className="min-w-0 truncate text-right text-stone sm:text-left">{p.hometown ?? "Not tracked"}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-stone">
        From the program&apos;s official {seasonLabel} roster
        {rosterUrl ? (
          <>
            {" ("}
            <a href={rosterUrl} target="_blank" rel="noopener noreferrer" className="underline">
              roster page
            </a>
            {")"}
          </>
        ) : null}
        , each rating read from the player&apos;s UTR profile (click a rating to open it)
        {read ? `, ${formatIsoDate(read)}` : ""}. Ratings UTR marks as not yet reliable are shown but don&apos;t count
        toward the team range. Rosters change; this is a snapshot.
      </p>
    </section>
  );
}

export function SchoolStaffList({ staff }: { staff: StaffMember[] }) {
  if (staff.length === 0) return null;
  const sources = [...new Map(staff.map((s) => [s.sourceUrl, s.readDate])).entries()];
  return (
    <div className="mt-2.5 text-sm">
      <ul className="flex flex-col gap-2">
        {staff.map((s) => (
          <li key={s.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={cn("text-ink", s.isHead && "font-semibold")}>{s.name}</span>
            {s.title ? <span className="text-stone">{s.title}</span> : null}
            {s.email ? (
              <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 text-grass underline-offset-2 hover:underline">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {s.email}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-xs text-stone">
        As listed on the school&apos;s official{" "}
        {sources.map(([url, date], i) => (
          <span key={url}>
            {i > 0 ? " and " : null}
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
              staff page
            </a>{" "}
            ({formatIsoDate(date)})
          </span>
        ))}
        . Only addresses the school publishes are shown.
      </p>
    </div>
  );
}
