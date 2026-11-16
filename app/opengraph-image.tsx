import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Seeded — your path to college tennis, mapped";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated, not a static asset, so it can never go stale against the
// design tokens. next/og (Satori) renders a constrained CSS subset with
// system fonts only — no custom Inter Tight load here, kept deliberately
// simple rather than fighting the renderer for a pixel-exact headline face.
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#F7F6F2",
          padding: "80px 96px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 22 22">
            <circle cx="11" cy="11" r="10" fill="#D7F25A" stroke="#14181A" strokeWidth="1.5" />
            <path d="M3 8c5 2 11 2 16 0M3 14c5-2 11-2 16 0" stroke="#14181A" strokeWidth="1.5" fill="none" />
          </svg>
          <span style={{ fontSize: 56, fontWeight: 700, color: "#14181A" }}>Seeded</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.15,
            color: "#14181A",
            maxWidth: 920,
          }}
        >
          Know which college teams you can make, and what to do this month.
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 26, color: "#5C625F" }}>
          seededtennis.com
        </div>
      </div>
    ),
    { ...size }
  );
}
