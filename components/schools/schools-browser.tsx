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
      // An unranked school is hidden only once the rank filter is narrowed.
      if (s.usNewsRanking === null ? maxRank < RANK_MAX : s.usNewsRanking > maxRank) return false;
      return true;
    });

    // No combined score (no US News rank) sorts after every scored school.
    const score = (s: (typeof filtered)[number]) => combinedScore(s) ?? Number.NEGATIVE_INFINITY;
    return filtered.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
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
