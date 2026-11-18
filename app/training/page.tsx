import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Still a private route (it resolves, by redirecting), so it keeps the
// noindex every private page carries.
export const metadata: Metadata = {
  title: "Training — Seeded",
  robots: { index: false, follow: false },
};

// The old /training planner generated weeks of sessions on the player's
// behalf ("UTR build week", "Add suggested session"). It is deleted; the
// player's own calendar is on /events, for both designs. Old links land
// there.
export default function TrainingPage() {
  redirect("/events");
}
