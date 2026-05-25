import {
  getConferences,
  getDivisions,
  getSchools,
  getStates,
} from "@/lib/data";
import { SchoolsBrowser } from "@/components/schools/schools-browser";
import { Badge } from "@/components/ui/badge";
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
        <div className="max-w-2xl">
          <Badge variant="leaf" size="md" className="mb-3">
            Free to browse
          </Badge>
          <h1 className="text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
            Find your honest fit among{" "}
            <span className="serif-accent text-grass">D1 tennis</span>.
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-stone">
            Every program with real roster UTRs, minimum competitive levels, and
            academic rankings. Search freely — no account needed.
          </p>
        </div>

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
