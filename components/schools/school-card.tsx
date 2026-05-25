import Link from "next/link";
import { MapPin, GraduationCap } from "lucide-react";
import type { School } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SchoolBadge } from "@/components/shared/school-badge";

export function SchoolCard({ school }: { school: School }) {
  return (
    <Link href={`/schools/${school.slug}`} className="block h-full">
      <Card interactive className="flex h-full flex-col p-5">
        <div className="flex items-start gap-3">
          <SchoolBadge school={school} size={52} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-medium text-ink">
              {school.shortName}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone">
              <MapPin className="h-3 w-3 shrink-0" />
              {school.city}, {school.state}
            </p>
            <Badge variant="default" size="sm" className="mt-2">
              {school.conference}
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 border-t-[0.5px] border-line pt-4">
          <Stat label="Avg UTR" value={school.avgRosterUTR.toFixed(1)} />
          <Stat label="Min UTR" value={school.minCompetitiveUTR.toFixed(1)} />
          <Stat
            label="US News"
            value={`#${school.usNewsRanking}`}
            icon
          />
        </div>
      </Card>
    </Link>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] text-stone-light">
        {icon && <GraduationCap className="h-3 w-3" />}
        {label}
      </p>
      <p className="mt-0.5 text-base font-medium text-ink">{value}</p>
    </div>
  );
}
