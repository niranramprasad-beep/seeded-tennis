import { MatchModeView } from "@/components/matches/match-mode-view";
import { SeededRouteRedirect } from "@/components/shared/seeded-route-redirect";

export default function MatchModePage() {
  return (
    <SeededRouteRedirect to="/events">
      <MatchModeView />
    </SeededRouteRedirect>
  );
}
