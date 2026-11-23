import type { Metadata } from "next";
import { getDivisions, getSchools } from "@/lib/db/schools";
import { SchoolsBrowser } from "@/components/schools/schools-browser";
import { ImportedProgramsSection } from "@/components/schools/imported-programs-section";
import { CATALOG_PHASE1_ENABLED } from "@/lib/config/catalog";

export const metadata: Metadata = {
  title: "College tennis programs by UTR fit — Seeded",
  description:
    "Browse college tennis programs sorted by how your UTR compares to each team's range — Likely, Target, Reach or Out of range — with division, conference and location filters.",
  alternates: { canonical: "/schools" },
};

// The catalog merges the owner's sheet from the database (lib/db/schools.ts).
// Its in-process cache hides the fetch from Next, so the refresh is declared
// here: a re-imported range reaches this page within the hour, no redeploy.
export const revalidate = 3600;

export default async function SchoolsPage() {
  const [schools, divisions] = await Promise.all([getSchools(), getDivisions()]);

  return (
    <>
      <div className="mx-auto max-w-content container-px py-10">
        {/* The title/subtitle/search row lives inside SeededSchoolsBrowser
            (it needs the live ranked count). */}
        <div className="mt-8">
          <SchoolsBrowser schools={schools} divisions={divisions} />
        </div>

        {/* Catalog phase 1 (048). Off by default; off = this page unchanged. */}
        {CATALOG_PHASE1_ENABLED ? <ImportedProgramsSection /> : null}
      </div>
    </>
  );
}
