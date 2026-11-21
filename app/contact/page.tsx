"use client";

import { Mail } from "lucide-react";
import { seededButtonVariants } from "@/components/seeded/ui/button";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/shared/reveal";
import { SUPPORT_EMAIL } from "@/lib/config/contact";

export default function ContactPage() {
  return <SeededContact />;
}

function SeededContact() {
  // Design system v2: a plain card on the page background (radius 16 for a
  // single large card), ink headline, one green button. Was a gradient
  // banner with white text and a gradient pill button.
  return (
    <div className="seeded-section-y mx-auto max-w-3xl px-6">
      <Reveal className="w-full rounded-2xl border border-line bg-card p-6 sm:p-10">
        <p className="seeded-eyebrow">Contact Seeded</p>
        <h1 className="font-seeded text-4xl font-bold tracking-[-0.02em] text-ink">
          Questions, feedback, or support.
        </h1>
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg text-ink">
              Send an email to{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-grass underline underline-offset-4"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              for any questions.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-stone">
              For a data correction, include the school name, men&apos;s or women&apos;s team, and what
              looks wrong.
            </p>
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={cn(seededButtonVariants({ variant: "primary" }), "shrink-0 whitespace-nowrap")}>
            <Mail className="h-4 w-4" aria-hidden />
            Email us
          </a>
        </div>
      </Reveal>
    </div>
  );
}
