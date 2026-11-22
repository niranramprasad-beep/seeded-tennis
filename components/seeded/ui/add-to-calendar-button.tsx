"use client";

import { CalendarPlus } from "lucide-react";
import { buildIcsCalendar, icsFilename, type IcsEvent } from "@/lib/ics";
import { downloadTextFile } from "@/lib/data/export-csv";
import { cn } from "@/lib/utils";
import { SeededButton } from "./button";

/** Builds the .ics for `events` and hands it to the browser as a download.
 *  Nothing leaves the device: no OAuth, no server, no storage. */
export function downloadIcs(filename: string, events: IcsEvent[]): void {
  if (events.length === 0) return;
  downloadTextFile(icsFilename(filename), buildIcsCalendar(events), "text/calendar");
}

/**
 * "Add to calendar": downloads an .ics of `events` that Google Calendar,
 * Apple Calendar and the rest import. Disabled when there is nothing to
 * add. `label` is the accessible name when the visible text alone would be
 * ambiguous in a list; it must START with "Add to calendar" so the visible
 * text stays part of the name (WCAG 2.5.3).
 */
export function AddToCalendarButton({
  events,
  filename,
  label,
  variant = "secondary",
  className,
}: {
  events: IcsEvent[];
  filename: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <SeededButton
      type="button"
      variant={variant}
      disabled={events.length === 0}
      aria-label={label}
      onClick={() => downloadIcs(filename, events)}
      className={cn(className)}
    >
      <CalendarPlus className="h-4 w-4" aria-hidden />
      Add to calendar
    </SeededButton>
  );
}
