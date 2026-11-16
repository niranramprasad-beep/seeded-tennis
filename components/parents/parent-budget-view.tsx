"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { SchoolLite } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { useDesign } from "@/lib/context/design-context";
import { SeededFamilyBudgetView } from "@/components/seeded/family/seeded-family-budget-view";

// /family/budget is new in this rebuild and only has a Seeded mockup
// (there's no Legacy "Budget" nav slot — Legacy keeps its own standalone
// /cost-calculator page, untouched). A Legacy session landing here
// (deep link, bookmark) gets bounced back to /family rather than shown a
// route with nothing built for it — same redirect-to-a-known-good-page
// discipline AuthGate itself uses.
export function ParentBudgetView({ schools }: { schools: SchoolLite[] }) {
  return (
    <AuthGate>
      <ParentBudgetInner schools={schools} />
    </AuthGate>
  );
}

function ParentBudgetInner({ schools }: { schools: SchoolLite[] }) {
  const { design } = useDesign();
  const router = useRouter();
  const isSeeded = design === "seeded";

  useEffect(() => {
    if (!isSeeded) router.replace("/family");
  }, [isSeeded, router]);

  if (!isSeeded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <motion.span
          className="h-8 w-8 rounded-full border-2 border-line border-t-grass"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return <SeededFamilyBudgetView schools={schools} />;
}
