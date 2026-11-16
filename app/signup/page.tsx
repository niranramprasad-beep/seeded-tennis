import type { Metadata } from "next";
import { SignupFlow } from "@/components/auth/signup-flow";

export const metadata: Metadata = {
  title: "Create your account — Seeded",
  description: "Create a free Seeded player account to save your fit report and build your recruiting plan.",
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return <SignupFlow />;
}
