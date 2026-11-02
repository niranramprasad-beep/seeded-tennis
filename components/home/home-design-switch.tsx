"use client";

import type { SchoolLite } from "@/lib/types";
import { useDesign } from "@/lib/context/design-context";
import { LegacyHomeView } from "./legacy-home-view";
import { SeededHomeView } from "@/components/seeded/home/seeded-home-view";

export function HomeDesignSwitch({ marqueeSchools }: { marqueeSchools: SchoolLite[] }) {
  const { design } = useDesign();
  return design === "seeded" ? (
    <SeededHomeView marqueeSchools={marqueeSchools} />
  ) : (
    <LegacyHomeView marqueeSchools={marqueeSchools} />
  );
}
