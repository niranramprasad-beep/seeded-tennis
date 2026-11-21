import type { Metadata } from "next";
import { TeamRangeAdmin } from "@/components/admin/team-range-admin";

// Owner-only (catalog phase 1, migration 048). Not linked from any nav.
// The page asks is_app_admin() and shows nothing useful to anyone else, but
// that is cosmetic: team_ranges_insert_admin (RLS) is what refuses a
// non-admin's write. Disallowed in robots.txt via lib/seo/private-routes.ts.
export const metadata: Metadata = {
  title: "Team ranges — Seeded",
  robots: { index: false, follow: false },
};

export default function TeamRangesAdminPage() {
  return <TeamRangeAdmin />;
}
