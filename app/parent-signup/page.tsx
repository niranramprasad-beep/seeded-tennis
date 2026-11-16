import type { Metadata } from "next";
import { SignupFlow } from "@/components/auth/signup-flow";

export const metadata: Metadata = {
  title: "Create a parent account — Seeded",
  description: "Create a free Seeded parent account to follow your player's recruiting progress.",
  alternates: { canonical: "/parent-signup" },
};

export default function ParentSignupPage() {
  return <SignupFlow accountType="parent" />;
}
