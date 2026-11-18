import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailVerified } from "@/components/auth/email-verified";

export const metadata: Metadata = {
  title: "Confirming your email — Seeded",
  // Nothing here is content, and the URL carries a one-time code.
  robots: { index: false, follow: false },
};

export default function EmailVerifiedPage() {
  return (
    <Suspense fallback={null}>
      <EmailVerified />
    </Suspense>
  );
}
