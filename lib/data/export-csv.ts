import type { Player, SchoolLite } from "@/lib/types";
import type { MatchRecord } from "@/lib/db/events";
import type { OutreachStatusMapDated } from "@/lib/db/outreach";
import type { UtrEntry } from "@/lib/db/plan";
import { formatDate } from "@/lib/time";

// Real export of whatever the app already has for this player — no new
// backend, just the same data already loaded via loadMatches()/
// loadUtrEntries()/loadCoachOutreachDated() and the schools catalog,
// written out as one CSV with a section per data type (a real spreadsheet
// tool opens this as a single flat sheet; there's no multi-sheet XLSX
// dependency in this app to justify adding one just for this).
export interface AccountExportInput {
  player: Player;
  targetSchools: SchoolLite[];
  matches: MatchRecord[];
  utrEntries: UtrEntry[];
  outreach: OutreachStatusMapDated;
}

// RFC 4180-ish: wrap in quotes (and double up internal quotes) whenever the
// field contains a comma, quote, or newline; otherwise leave it bare.
export function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(values: Array<string | number | null | undefined>): string {
  return values.map(csvEscape).join(",");
}

export function buildAccountDataCsv({
  player,
  targetSchools,
  matches,
  utrEntries,
  outreach,
}: AccountExportInput): string {
  const lines: string[] = [];

  lines.push(`Seeded data export — ${player.name || "player"}`);
  lines.push(`Generated,${formatDate(new Date())}`);
  lines.push("");

  lines.push("Schools");
  lines.push(row(["Name", "Slug", "Conference", "State", "Division"]));
  for (const s of targetSchools) {
    lines.push(row([s.name, s.slug, s.conference, s.state, s.division]));
  }
  if (targetSchools.length === 0) lines.push("(no target schools yet)");
  lines.push("");

  lines.push("Results");
  lines.push(row(["Date", "Opponent", "Opponent UTR", "Result", "Score", "Surface", "Tournament"]));
  for (const m of matches) {
    lines.push(
      row([
        m.matchDate,
        m.opponent,
        m.opponentUtr ?? "",
        m.result ?? "",
        m.score,
        m.surface,
        m.tournamentName,
      ])
    );
  }
  if (matches.length === 0) lines.push("(no logged results yet)");
  lines.push("");

  lines.push("UTR history");
  lines.push(row(["Date", "UTR", "Note"]));
  for (const e of utrEntries) {
    lines.push(row([e.recordedAt, e.utr, e.note]));
  }
  if (utrEntries.length === 0) lines.push("(no UTR history yet)");
  lines.push("");

  lines.push("Outreach");
  lines.push(row(["School", "Status", "Last updated", "Reminder set for"]));
  const outreachSlugs = Object.keys(outreach);
  for (const slug of outreachSlugs) {
    const entry = outreach[slug];
    const school = targetSchools.find((s) => s.slug === slug);
    lines.push(row([school?.name ?? slug, entry.status, entry.updatedAt, entry.remindAt ?? ""]));
  }
  if (outreachSlugs.length === 0) lines.push("(no outreach tracked yet)");

  return lines.join("\n");
}

// Pure DOM side effect, split out from the CSV-building logic above so that
// logic stays unit-testable without a browser/DOM environment.
export function downloadTextFile(filename: string, content: string, mimeType = "text/csv"): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
