import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }
  return { url, key };
}

/**
 * A Supabase client scoped to the current request.
 *
 * Never cache or share the returned client across requests — it carries that
 * request's cookies, and reusing it would leak one visitor's session into
 * another's response.
 */
export async function createSupabaseServerClient() {
  // Read cookies FIRST. This is what tells Next the route renders per-request;
  // if anything below throws before it runs, the route silently prerenders as
  // static with no session, and whether that happens would depend on which env
  // vars were set at build time.
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. Token refreshes are
          // handled in proxy.ts, so there is nothing to recover here.
        }
      },
    },
  });
}
