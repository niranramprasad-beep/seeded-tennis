import { permanentRedirect } from "next/navigation";

// There is one sign-in for everyone now. This route stays as a redirect
// rather than a 404 because the separate parent form has been linked from
// /login for months and is sitting in people's history and bookmarks — and
// because it never did anything different: both forms posted the same
// credentials to the same Supabase endpoint, and what a parent sees is
// decided by `profiles.role` after authentication, not by which page they
// signed in from.
//
// `permanentRedirect` (308) so search engines fold it into /login rather
// than keeping a second sign-in page in the index.
export default function ParentLoginPage(): never {
  permanentRedirect("/login");
}
