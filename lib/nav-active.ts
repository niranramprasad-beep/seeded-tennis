// The ONE rule for "is this nav link the page I am on?" — the sidebar's
// primary items and its Tools group, the phone bottom bar, the avatar menu,
// the ⌘K palette and the public header all ask it here.
//
// The sidebar used to carry its own inline copy with a hand-written
// exception for "/family", and the avatar menu and palette had no notion of
// the current page at all, so a Tools page (Results, the tournament
// checker) opened from the phone menu showed nothing as current.

function clean(path: string): string {
  // Drop ?query and #hash, then any trailing slash (but keep "/" itself).
  const bare = path.split(/[?#]/, 1)[0] || "/";
  return bare.length > 1 ? bare.replace(/\/+$/, "") || "/" : bare;
}

/**
 * True when `pathname` is `href` itself or a page nested under it
 * (`/tournament-fit/share` is under `/tournament-fit`). Segment-aware:
 * `/schoolsx` is NOT under `/schools`. The site root `/` only matches
 * itself — otherwise it would be "active" on every page.
 */
export function isActivePath(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  const p = clean(pathname);
  const h = clean(href);
  if (h === "/") return p === "/";
  return p === h || p.startsWith(h + "/");
}

/**
 * Of a group of links shown together, the ONE that should read as current:
 * the longest href that `isActivePath` accepts. So on `/family/budget` the
 * parent's "Budget" (`/family/budget`) wins over "Overview" (`/family`)
 * instead of both lighting up. Returns null when none match.
 */
export function activeNavHref(pathname: string | null | undefined, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    if (isActivePath(pathname, h) && (best === null || clean(h).length > clean(best).length)) best = h;
  }
  return best;
}
