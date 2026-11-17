"use client";

import Link from "next/link";
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
    body: "Team UTR estimates and rankings should be checked against the school directly before making recruiting decisions — and costs, deadlines and detailed program information aren't in Seeded at all, so they have to come from the school. The platform is designed to guide planning, not replace direct school research.",
  },
  {
    title: "Accounts and family access",
    body: "Family members may share player progress and planning data. Each user is responsible for keeping login credentials and family codes private.",
  },
  {
    title: "Training calendar",
    body: "Training content is not medical advice. Players should adapt workloads with coaches, trainers, parents, and healthcare professionals as needed.",
  },
  {
    title: "Privacy",
    body: "Seeded stores your account details, tennis profile and activity to run your dashboard and family features. Your data is never sold, and only approved members of your own family can see it. Accounts for players under 13 cannot record anything about tennis — no saved schools, results, plans or tournaments — until a parent or guardian approves them. They can still edit their own profile details, download their data, and delete the account. You can download everything we hold, or delete your account and all of it immediately, from Settings. The full privacy policy — what we collect, who else touches it, and how long we keep it — is linked below.",
  },
];

// A clickable link, not the literal text "/privacy". The Privacy section
// above used to end with "…is at /privacy." — a URL rendered as prose, which
// nobody can click and which an independent verifier flagged as the kind of
// thing that reads as a link in review and is not one.
function PrivacyLink() {
  return (
    <p className="mt-6 text-sm text-stone">
      The full privacy policy is here:{" "}
      <Link href="/privacy" className="text-grass underline underline-offset-2">
        seededtennis.com/privacy
      </Link>
      .
    </p>
  );
}

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
          These are the current terms for using Seeded, effective 2026-11-15. We'll post an update here if anything changes.
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
      <PrivacyLink />
    </div>
  );
}

function SeededTerms() {
  return (
    <div className="seeded-section-y mx-auto max-w-4xl px-6">
      <Reveal className="seeded-section-head">
        <p className="seeded-eyebrow">Seeded terms</p>
        <h1 className="font-seeded text-4xl font-bold tracking-[-0.02em] text-ink">
          Terms, kept simple.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone">
          These are the current terms for using Seeded, effective 2026-11-15. We'll post an update here if anything changes.
        </p>
      </Reveal>
      <Reveal index={1}>
        <div className="divide-y divide-line rounded-xl border border-line bg-card">
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
      <PrivacyLink />
    </div>
  );
}
