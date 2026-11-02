"use client";

import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/shared/reveal";
import { useDesign } from "@/lib/context/design-context";

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
    body: "Seeded stores your account details, tennis profile, and activity (check-ins, matches, UTR history) to power your dashboard and family features. Your data is never sold, and family members only see data shared through your family code. You can request deletion of your account and data at any time via the contact page. We also use Google Analytics to see which pages get visited and how often — this tracks page views, not who you are, and never includes your name, email, or tennis data.",
  },
];

export default function TermsPage() {
  const { design } = useDesign();
  return design === "seeded" ? <SeededTerms /> : <LegacyTerms />;
}

function LegacyTerms() {
  return (
    <div className="mx-auto max-w-4xl container-px py-16">
      <div className="mb-8">
        <p className="font-serif text-lg italic text-leaf-accent">Seeded terms</p>
        <h1 className="mt-2 text-4xl font-light tracking-tight text-ink">Terms, kept simple.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone">
          These are the current terms for using Seeded. We'll post an update here if anything changes.
        </p>
      </div>
      <Card className="divide-y-[0.5px] divide-line">
        {TERMS.map((term) => (
          <section
            key={term.title}
            id={term.title === "Privacy" ? "privacy" : undefined}
            className="scroll-mt-20 p-6 sm:p-8"
          >
            <h2 className="text-xl font-medium text-ink">{term.title}</h2>
            <p className="mt-3 leading-relaxed text-stone">{term.body}</p>
          </section>
        ))}
      </Card>
    </div>
  );
}

function SeededTerms() {
  return (
    <div className="mx-auto max-w-4xl container-px py-16">
      <Reveal className="mb-8">
        <p className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
          Seeded terms
        </p>
        <h1 className="mt-2 font-seeded text-4xl font-semibold tracking-tight text-ink">
          Terms, kept simple.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone">
          These are the current terms for using Seeded. We'll post an update here if anything changes.
        </p>
      </Reveal>
      <Reveal index={1}>
        <div className="seeded-glass divide-y divide-[rgb(var(--c-line))] rounded-[24px] shadow-seeded-1">
          {TERMS.map((term) => (
            <section
              key={term.title}
              id={term.title === "Privacy" ? "privacy" : undefined}
              className="scroll-mt-20 p-6 sm:p-8"
            >
              <h2 className="font-seeded text-xl font-medium text-ink">{term.title}</h2>
              <p className="mt-3 leading-relaxed text-stone">{term.body}</p>
            </section>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
