"use client";

import { useMemo, useState } from "react";
import type { Division, School } from "@/lib/types";
import { useGender } from "@/lib/context/gender-context";
import { combinedScore } from "@/lib/db/schools";
import { SeededSchoolsBrowser } from "@/components/seeded/schools/seeded-schools-browser";

interface Props {
  schools: School[];
  divisions: Division[];
}

const RANK_MAX = 150;

// /schools' filter state. The table itself is SeededSchoolsBrowser; this
// owns the filters it hands down and the base ranking (Seeded score, best
// first) for the current gender, division, name search and US News ceiling.
export function SchoolsBrowser({ schools, divisions }: Props) {
  const { gender, setGender, isExplicit: genderIsExplicit } = useGender();
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState<"all" | Division>("all");
  const [maxRank, setMaxRank] = useState(RANK_MAX);

  const ranked = useMemo(() => {
    const filtered = schools.filter((s) => {
      if (s.gender !== gender) return false;
      if (division !== "all" && s.division !== division) return false;
      if (query && !s.name.toLowerCase().includes(query.toLowerCase()))
        return false;
      if (s.usNewsRanking > maxRank) return false;
      return true;
    });

    return filtered.sort((a, b) => combinedScore(b) - combinedScore(a));
  }, [schools, gender, division, query, maxRank]);

  const reset = () => {
    setQuery("");
    setDivision("all");
    setMaxRank(RANK_MAX);
  };

  return (
    <SeededSchoolsBrowser
      gender={gender}
      setGender={setGender}
      genderIsExplicit={genderIsExplicit}
      query={query}
      setQuery={setQuery}
      division={division}
      setDivision={setDivision}
      maxRank={maxRank}
      setMaxRank={setMaxRank}
      ranked={ranked}
      divisions={divisions}
      reset={reset}
      allSchools={schools}
    />
  );
}
