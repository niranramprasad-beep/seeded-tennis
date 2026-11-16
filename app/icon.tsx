import { ImageResponse } from "next/og";

// The favicon: the same tennis-ball mark as the OG image and the sidebar's
// lime dot. There was no favicon at all — /favicon.ico 404'd and no
// <link rel="icon"> was emitted, so every tab and bookmark showed a blank
// page glyph. Generated rather than a static file so it cannot drift from
// the OG image's mark.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
        <svg width="30" height="30" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="10" fill="#D7F25A" stroke="#14181A" strokeWidth="1.6" />
          <path d="M3 8c5 2 11 2 16 0M3 14c5-2 11-2 16 0" stroke="#14181A" strokeWidth="1.6" fill="none" />
        </svg>
      </div>
    ),
    size
  );
}
