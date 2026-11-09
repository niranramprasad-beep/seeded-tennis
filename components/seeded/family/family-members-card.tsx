import type { FamilyMember } from "@/lib/supabase/features";
import { cn } from "@/lib/utils";

// Pixel-exact to "18 Parent view + budget.png"'s "Family members" card:
// each real member (lib/supabase/features.ts's loadFamilyMembers(), the
// same family roster /settings' family card already reads) with a role
// badge, then a dashed invite-code box. "Account holder" isn't a column
// anywhere in `profiles` — it's inferred as the earliest-created parent
// row for the family (a real, if indirect, signal: whoever's `profiles`
// row was created first is whoever ran signup and minted the family code),
// never a guess at a name.
export function FamilyMembersCard({
  members,
  familyCode,
}: {
  members: FamilyMember[];
  familyCode: string | undefined;
}) {
  const accountHolderId = earliestParentId(members);

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Family members</h2>
      <div className="mt-4 space-y-3">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3">
            <span className="truncate text-ink">{m.name}</span>
            <span
              className={cn(
                "shrink-0 whitespace-nowrap rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold capitalize text-stone"
              )}
            >
              {m.role === "player" ? "Player" : m.id === accountHolderId ? "Parent · account holder" : "Parent"}
            </span>
          </div>
        ))}
        {members.length === 0 && <p className="text-sm text-stone">No family members yet.</p>}
      </div>

      {familyCode && (
        <div className="mt-4 rounded-[12px] border border-dashed border-input p-3.5 text-sm">
          <span className="text-stone">Invite another parent with code</span>
          <p className="mt-1 font-mono font-semibold text-ink">{familyCode}</p>
        </div>
      )}
    </div>
  );
}

function earliestParentId(members: FamilyMember[]): string | null {
  const parents = members.filter((m) => m.role === "parent" && m.createdAt);
  if (parents.length === 0) return null;
  return parents.reduce((earliest, m) =>
    new Date(m.createdAt!).getTime() < new Date(earliest.createdAt!).getTime() ? m : earliest
  ).id;
}
