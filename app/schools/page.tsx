import type { Metadata } from "next";
import {
  getCatalogCounts,
  getConferences,
  getDivisions,
  getSchools,
  getStates,
} from "@/lib/db/schools";
import { SchoolsBrowser } from "@/components/schools/schools-browser";
import { SchoolsHeader } from "@/components/seeded/schools/seeded-schools-header";
import { ImportedProgramsSection } from "@/components/schools/imported-programs-section";
import { CATALOG_PHASE1_ENABLED } from "@/lib/config/catalog";

export const metadata: Metadata = {
  title: "College tennis programs by UTR fit — Seeded",
  description:
    "Browse college tennis programs sorted by how your UTR compares to each team's range — Likely, Target, Reach or Out of range — with division, conference and location filters.",
  alternates: { canonical: "/schools" },
};

export default async function SchoolsPage() {
  const [schools, conferences, states, divisions, counts] = await Promise.all([
    getSchools(),
    getConferences(),
    getStates(),
    getDivisions(),
    getCatalogCounts(),
  ]);

  return (
    <>
      <div className="mx-auto max-w-content container-px py-10">
        <SchoolsHeader counts={counts} />

        <div className="mt-8">
          <SchoolsBrowser
            schools={schools}
            conferences={conferences}
            states={states}
            divisions={divisions}
          />
        </div>

        {/* Catalog phase 1 (048). Off by default; off = this page unchanged. */}
        {CATALOG_PHASE1_ENABLED ? <ImportedProgramsSection /> : null}
      </div>
    </>
  );
}
