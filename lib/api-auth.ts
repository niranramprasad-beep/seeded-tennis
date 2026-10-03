import { createClient, type User } from "@supabase/supabase-js";

// Shared by API routes that need to know which Supabase user is making the
// request — the client sends their session's access token as a Bearer
// header, and we validate it against Supabase Auth directly (no cookies/SSR
// helper needed, since every call here is a one-off fetch from a client
// component, not a page render).
export async function getAuthedUser(req: Request): Promise<User | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return null;

  const supabase = createClient(url, key);
  const { data } = await supabase.auth.getUser(token);
  return data.user;
}
