import type { Metadata } from "next";
import { MatchModeView } from "@/components/matches/match-mode-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

// Behind an AuthGate and disallowed in robots.txt. The meta tag is the
// belt-and-braces half: robots.txt is a request, a meta robots tag is an
// instruction to a crawler that already has the page.
export const metadata: Metadata = {
  title: "Match mode — Seeded",
  robots: { index: false, follow: false },
};

export default function MatchModePage() {
  return (
    <SeededRouteRedirect to="/events">
      <MatchModeView />
    </SeededRouteRedirect>
  );
}
