// "Add to calendar": an iCalendar (.ics, RFC 5545) file the player downloads
// and opens in Google Calendar, Apple Calendar or anything else that imports
// one. Pure — no DOM, no network, no clock unless the caller omits `now`.
//
// What this file guarantees (lib/ics.test.ts pins each one):
//   - CRLF line endings, including after the last line.
//   - Content lines folded at 75 OCTETS (UTF-8 bytes, not characters), a
//     multi-byte character never split across a fold, each continuation line
//     starting with one space (which counts toward its 75).
//   - TEXT values escape `\` `;` `,` and newlines (`\n`); other control
//     characters are dropped (RFC 5545 §3.3.11 does not allow them).
//   - One VCALENDAR with PRODID, VERSION:2.0, CALSCALE:GREGORIAN and
//     METHOD:PUBLISH.
//   - Every VEVENT has a UID that is the item's own id + "@seededtennis.com"
//     (so the same item always gets the same UID and a re-import updates
//     rather than duplicates), and a DTSTAMP in UTC.
//   - All-day events are DTSTART;VALUE=DATE with an EXCLUSIVE DTEND (the day
//     after the last day). Timed events are UTC ("Z") — no TZID, so no
//     VTIMEZONE is needed.
//
// Nothing here invents content: an event carries only what the caller hands
// it, and every caller hands it what the player entered (lib/ics-items.ts).
// No VALARM: Seeded sends no reminders, and the file does not ask a calendar
// app to either.

export const ICS_UID_DOMAIN = "seededtennis.com";
export const ICS_PRODID = "-//Seeded//Seeded Tennis//EN";

interface IcsEventBase {
  /** The item's own stable id (a session/tournament uuid, or a key derived
   *  from one). The builder appends "@seededtennis.com". */
  id: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  /** A link back to the page the item lives on. */
  url?: string | null;
}

export interface IcsAllDayEvent extends IcsEventBase {
  kind: "all-day";
  /** First day, "YYYY-MM-DD" (a local calendar day). */
  date: string;
  /** Last day INCLUSIVE, "YYYY-MM-DD"; defaults to `date`. The file's
   *  DTEND is the day after it, as RFC 5545 requires. */
  lastDate?: string;
}

export interface IcsTimedEvent extends IcsEventBase {
  kind: "timed";
  start: Date;
  end: Date;
}

export type IcsEvent = IcsAllDayEvent | IcsTimedEvent;

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeIcsText(value: string): string {
  return (
    value
      .replace(/\r\n?/g, "\n")
      // Control characters other than LF and HTAB are not allowed in TEXT.
      // (No lint suppression for no-control-regex: next/core-web-vitals does
      // not enable it, and ESLint 9 fails --max-warnings=0 on an unused
      // directive.)
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n")
  );
}

const utf8 = new TextEncoder();
const octets = (s: string) => utf8.encode(s).length;

/** RFC 5545 §3.1: fold a content line so no physical line exceeds 75
 *  octets. Splits only between code points, never inside one. */
export function foldIcsLine(line: string): string {
  if (octets(line) <= MAX_LINE_OCTETS) return line;
  const out: string[] = [];
  let current = "";
  let currentOctets = 0;
  // The first physical line may hold 75 octets; each continuation line
  // starts with a space, leaving 74 for content.
  let limit = MAX_LINE_OCTETS;
  for (const ch of line) {
    const n = octets(ch);
    if (currentOctets + n > limit) {
      out.push(current);
      current = "";
      currentOctets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += ch;
    currentOctets += n;
  }
  out.push(current);
  return out.join(CRLF + " ");
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateKey(key: string): { y: number; m: number; d: number } {
  const match = DATE_KEY.exec(key);
  if (!match) throw new Error(`Not a calendar date: ${JSON.stringify(key)}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Not a calendar date: ${JSON.stringify(key)}`);
  }
  return { y, m, d };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "YYYY-MM-DD" → "YYYYMMDD" (DATE value), plus `addDays`. Pure calendar
 *  arithmetic in UTC, so no local time zone or DST can move the day. */
function icsDate(key: string, addDays = 0): string {
  const { y, m, d } = parseDateKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + addDays));
  return `${pad(dt.getUTCFullYear(), 4)}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

/** A Date → "YYYYMMDDTHHMMSSZ" (UTC DATE-TIME). */
export function icsUtcDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** The item id + "@seededtennis.com". Deterministic: the same id always
 *  gives the same UID. */
export function icsUid(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error("An event needs an id for its UID");
  return `${trimmed}@${ICS_UID_DOMAIN}`;
}

function eventLines(event: IcsEvent, dtstamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${escapeIcsText(icsUid(event.id))}`, `DTSTAMP:${dtstamp}`];
  if (event.kind === "all-day") {
    const last = event.lastDate ?? event.date;
    if (icsDate(last) < icsDate(event.date)) throw new Error("An all-day event cannot end before it starts");
    lines.push(`DTSTART;VALUE=DATE:${icsDate(event.date)}`, `DTEND;VALUE=DATE:${icsDate(last, 1)}`);
  } else {
    if (event.end.getTime() <= event.start.getTime()) throw new Error("A timed event must end after it starts");
    lines.push(`DTSTART:${icsUtcDateTime(event.start)}`, `DTEND:${icsUtcDateTime(event.end)}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(event.summary.trim() || "Event")}`);
  const description = event.description?.trim();
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  const location = event.location?.trim();
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  // URL is a URI value, not TEXT — no backslash escaping. Only http(s), and
  // no raw whitespace/control characters (they would break the line).
  const url = event.url?.trim();
  if (url && /^https?:\/\/[^\s\u0000-\u001F\u007F]+$/i.test(url)) lines.push(`URL:${url}`);
  lines.push("END:VEVENT");
  return lines;
}

/** The whole .ics file for `events`, in the order given. */
export function buildIcsCalendar(events: IcsEvent[], options: { now?: Date } = {}): string {
  const dtstamp = icsUtcDateTime(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${ICS_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap((e) => eventLines(e, dtstamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

/** A safe download name: lowercase ASCII letters, digits and single
 *  hyphens, at most 60 characters, always ending ".ics". */
export function icsFilename(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.ics$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${base || "seeded-calendar"}.ics`;
}
