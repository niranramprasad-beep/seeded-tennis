import type { Metadata } from "next";
import { EventsInner } from "@/components/seeded/events/events-inner";

// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Events — Seeded",
  robots: { index: false, follow: false },
};

// One page for both designs. Legacy used to get a tab switcher over the old
// /training planner (which generated plans) and Match mode; both are gone
// (docs/DECISIONS.md, 2026-11-18).
export default function EventsPage() {
  return <EventsInner />;
}
