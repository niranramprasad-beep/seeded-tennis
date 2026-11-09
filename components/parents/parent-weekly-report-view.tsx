"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { SchoolLite } from "@/lib/types";
import { AuthGate } from "@/components/shared/auth-gate";
import { useDesign } from "@/lib/context/design-context";
import { SeededWeeklyReportView } from "@/components/seeded/family/seeded-weekly-report-view";

// Same "new route, Seeded-only" redirect discipline as
// components/parents/parent-budget-view.tsx — see that file's comment.
export function ParentWeeklyReportView({ schools }: { schools: SchoolLite[] }) {
  return (
    <AuthGate>
      <ParentWeeklyReportInner schools={schools} />
    </AuthGate>
  );
}

function ParentWeeklyReportInner({ schools }: { schools: SchoolLite[] }) {
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

  return <SeededWeeklyReportView schools={schools} />;
}
