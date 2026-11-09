import {
  getConferences,
  getDivisions,
  getSchools,
  getStates,
} from "@/lib/db/schools";
import { SchoolsBrowser } from "@/components/schools/schools-browser";
import { SchoolsHeader } from "@/components/seeded/schools/seeded-schools-header";
import { Footer } from "@/components/layout/footer";

export default async function SchoolsPage() {
  const [schools, conferences, states, divisions] = await Promise.all([
    getSchools(),
    getConferences(),
    getStates(),
    getDivisions(),
  ]);

  return (
    <>
      <div className="mx-auto max-w-content container-px py-10">
        <SchoolsHeader />

        <div className="mt-8">
          <SchoolsBrowser
            schools={schools}
            conferences={conferences}
            states={states}
            divisions={divisions}
          />
        </div>
      </div>
      <Footer />
    </>
  );
}
