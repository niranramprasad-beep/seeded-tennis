import { Card } from "@/components/ui/card";

const TERMS = [
  {
    title: "Use of Seeded",
    body: "Seeded provides recruiting, school-comparison, and training-planning tools for informational purposes. It does not guarantee admission, roster placement, scholarship offers, or coach responses.",
  },
  {
    title: "Data and recommendations",
    body: "Roster UTRs, rankings, costs, deadlines, and program details should be reviewed before making recruiting decisions. The platform is designed to guide planning, not replace direct school research.",
  },
  {
    title: "Accounts and family access",
    body: "Family members may share player progress and planning data. Each user is responsible for keeping login credentials and family codes private.",
  },
  {
    title: "Training plans",
    body: "Training content is not medical advice. Players should adapt workloads with coaches, trainers, parents, and healthcare professionals as needed.",
  },
  {
    title: "Privacy",
    body: "Seeded stores your account details, tennis profile, and activity (check-ins, matches, UTR history) to power your dashboard and family features. Your data is never sold, and family members only see data shared through your family code. You can request deletion of your account and data at any time via the contact page.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl container-px py-16">
      <div className="mb-8">
        <p className="font-serif text-lg italic text-leaf-accent">Seeded terms</p>
        <h1 className="mt-2 text-4xl font-light tracking-tight text-ink">Simple terms for the MVP.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone">
          These placeholder terms are written for the current startup MVP. Official legal terms may be updated later.
        </p>
      </div>
      <Card className="divide-y-[0.5px] divide-line">
        {TERMS.map((term) => (
          <section key={term.title} className="p-6 sm:p-8">
            <h2 className="text-xl font-medium text-ink">{term.title}</h2>
            <p className="mt-3 leading-relaxed text-stone">{term.body}</p>
          </section>
        ))}
      </Card>
    </div>
  );
}
