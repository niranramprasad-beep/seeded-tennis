"use client";

import type { ReactNode } from "react";
import { useDesign } from "@/lib/context/design-context";

// Thin client wrapper so a Server Component (app/schools/[slug]/page.tsx)
// can branch on design without itself becoming a client component — it
// just hands back whichever pre-rendered subtree matches.
export function SchoolDetailSwitch({ legacy, seeded }: { legacy: ReactNode; seeded: ReactNode }) {
  const { design } = useDesign();
  return design === "seeded" ? <>{seeded}</> : <>{legacy}</>;
}
