import { ImageResponse } from "next/og";

// Home-screen icon (iOS). Same mark as app/icon.tsx on the site's light
// surface, with the padding iOS expects — it rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F6F2" }}>
        <svg width="132" height="132" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="10" fill="#D7F25A" stroke="#14181A" strokeWidth="1.2" />
          <path d="M3 8c5 2 11 2 16 0M3 14c5-2 11-2 16 0" stroke="#14181A" strokeWidth="1.2" fill="none" />
        </svg>
      </div>
    ),
    size
  );
}
