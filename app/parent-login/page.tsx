import type { Metadata } from "next";
import { ParentLoginForm } from "@/components/auth/parent-login-form";

export const metadata: Metadata = {
  title: "Parent sign in — Seeded",
  description: "Sign in to your Seeded parent account.",
  alternates: { canonical: "/parent-login" },
};

export default function ParentLoginPage() {
  return <ParentLoginForm />;
}
