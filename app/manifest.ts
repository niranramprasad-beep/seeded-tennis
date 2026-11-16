import type { MetadataRoute } from "next";

// Lets "Add to Home Screen" name the app and use the real icon. Not a PWA:
// there is no service worker and no offline mode, so `display` is the
// ordinary browser one rather than "standalone", which would hide the
// address bar on an app that does not work offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Seeded — college tennis recruiting, planned",
    short_name: "Seeded",
    start_url: "/",
    display: "browser",
    background_color: "#F7F6F2",
    theme_color: "#F7F6F2",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
