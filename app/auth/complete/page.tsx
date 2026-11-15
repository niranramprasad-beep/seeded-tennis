import type { Metadata } from "next";
import { Suspense } from "react";
import { CompleteOAuthSignup } from "@/components/auth/complete-oauth-signup";

export const metadata: Metadata = {
  title: "Finish setting up — Seeded",
  robots: { index: false, follow: false },
};

export default function AuthCompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteOAuthSignup />
    </Suspense>
  );
}
