import type { Metadata } from "next";
import Link from "next/link";
import {
  POLICY_CONTACT_EMAIL,
  POLICY_EFFECTIVE_DATE,
  PRIVACY_SECTIONS,
} from "@/lib/legal/policy";

export const metadata: Metadata = {
  title: "Privacy policy — Seeded",
  description:
    "What Seeded collects, who else touches it, how under-13 accounts work, and how to get your data out or delete it.",
  alternates: { canonical: "/privacy" },
};

// Content lives in lib/legal/policy.ts, where every claim carries the file or
// migration that makes it true and lib/legal/policy.test.ts fails the build
// when one of those stops being true. This page is only the rendering.
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[760px] container-px py-14">
      <h1 className="font-seeded text-4xl font-semibold tracking-[-0.02em] text-ink">
        Privacy policy
      </h1>
      <p className="mt-3 text-[17px] leading-[1.55] text-stone">
        Plain English, and only things Seeded actually does. Most people using
        Seeded are under 18, so this is written to be read by a player and a
        parent together.
      </p>
      <p className="mt-2 text-sm text-stone">
        Effective {POLICY_EFFECTIVE_DATE}.{" "}
        <Link href="/terms" className="text-grass underline underline-offset-2">
          Terms of use
        </Link>
      </p>

      <nav aria-label="On this page" className="mt-8 rounded-xl border border-line bg-panel p-5">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-stone">
          On this page
        </p>
        <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {PRIVACY_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center text-sm text-grass underline-offset-4 hover:underline sm:min-h-6"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 space-y-10">
        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="font-seeded text-2xl font-semibold tracking-[-0.01em] text-ink">
              {section.title}
            </h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="mt-3 text-[16px] leading-[1.55] text-ink">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-line pt-6 text-sm text-stone">
        Something here not match what you see in the product? Tell us at{" "}
        <a
          href={`mailto:${POLICY_CONTACT_EMAIL}`}
          className="text-grass underline underline-offset-2"
        >
          {POLICY_CONTACT_EMAIL}
        </a>{" "}
        — we would rather fix the page than defend it.
      </p>
    </div>
  );
}
