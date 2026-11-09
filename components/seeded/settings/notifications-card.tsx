"use client";

import { SeededToggle } from "@/components/seeded/ui/toggle";
import type { NotificationPrefs } from "@/lib/db/settings";

const ROWS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: "weeklyDigest", label: "Weekly digest (Sunday)" },
  { key: "schoolBandChange", label: "A school changes band" },
  { key: "followUpReminders", label: "Follow-up reminders" },
  { key: "tournamentDeadlines", label: "Tournament entry deadlines" },
  { key: "productNews", label: "Product news" },
];

// Pixel-exact to the mockup's "Notifications" card. Real persisted toggles —
// see lib/db/settings.ts (the existing user_settings.
// notification_preferences JSONB bag, not a new column).
export function NotificationsCard({
  prefs,
  onChange,
}: {
  prefs: NotificationPrefs;
  onChange: (next: NotificationPrefs) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Notifications</h2>
      <p className="mt-1 text-sm text-stone">
        Default is one weekly digest. Only coach replies and deadlines come right away.
      </p>

      <div className="mt-4 divide-y divide-line">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between py-3.5">
            <span className="text-[15px] text-ink">{r.label}</span>
            <SeededToggle
              checked={prefs[r.key]}
              onChange={(v) => onChange({ ...prefs, [r.key]: v })}
              label={r.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
