import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// Private: behind an AuthGate and disallowed in robots.txt.
export const metadata: Metadata = {
  title: "Reset your password — Seeded",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
