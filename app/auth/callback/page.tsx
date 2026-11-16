import type { Metadata } from "next";
import { Suspense } from "react";
import { OAuthCallback } from "@/components/auth/oauth-callback";

export const metadata: Metadata = {
  title: "Signing you in — Seeded",
  // Nothing here is content. Keeping it out of the index also keeps OAuth
  // codes out of search-engine crawl logs.
  robots: { index: false, follow: false },
};

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallback />
    </Suspense>
  );
}
