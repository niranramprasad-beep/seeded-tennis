"use client";

import type { SchoolLite } from "@/lib/types";
import { useDesign } from "@/lib/context/design-context";
import { LegacyHomeView } from "./legacy-home-view";
import { PremiumHomeView } from "@/components/premium/home/premium-home-view";

export function HomeDesignSwitch({ marqueeSchools }: { marqueeSchools: SchoolLite[] }) {
  const { design } = useDesign();
  return design === "premium" ? (
    <PremiumHomeView marqueeSchools={marqueeSchools} />
  ) : (
    <LegacyHomeView marqueeSchools={marqueeSchools} />
  );
}
