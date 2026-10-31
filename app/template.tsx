// Re-mounts on every route change (that's what template.tsx is for, unlike
// layout.tsx) — kept for that remount behavior, not for decoration. The
// fade itself is handled once already, in app-shell.tsx's animate-fade-in;
// this used to ALSO slide+fade on top of that, so every navigation played
// two overlapping entrance animations. Just a passthrough now.
//
// Deliberately no `filter` animation here (even a blur that settles at
// "blur(0px)") — Framer Motion leaves the literal filter value applied at
// rest instead of clearing it to "none", and any non-"none" `filter` on an
// ancestor creates a new containing block for `position: fixed` descendants.
// That silently broke every Drawer in the app (fixed panels were positioned
// against this wrapper instead of the viewport, pushing footer buttons like
// "Create plan" off-screen and unclickable).
export default function Template({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
