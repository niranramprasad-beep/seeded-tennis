// The sentence shown when a star would go past the Free cap. A signed-out
// visitor has no plan to upgrade: "Free tracks 3 schools. Upgrade to Player"
// was said to someone with no account at all (final-check B22). Pure, so the
// two audiences are unit-tested (star-limit.test.ts).

export interface StarLimitToast {
  message: string;
  action: { label: string; href: string };
}

export function starLimitToast(isAuthed: boolean, limit: number): StarLimitToast {
  if (!isAuthed) {
    return {
      // Promises nothing about carrying these stars over: it only states
      // the cap and where more comes from.
      message: `You can star up to ${limit} schools without a plan. Player tracks more.`,
      action: { label: "See plans", href: "/pricing" },
    };
  }
  return {
    message: `Free tracks ${limit} schools. Upgrade to Player to track more.`,
    action: { label: "See plans", href: "/pricing" },
  };
}
