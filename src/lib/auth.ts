import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * Returns the signed-in user's id, or null.
 *
 * The shape deliberately matches the `auth()` this replaced, so the ~60 call
 * sites across route handlers, server actions and AI tools did not have to
 * change — only their import path.
 *
 * `getClaims()` verifies the JWT rather than trusting the cookie, and does it
 * locally against the project's signing keys, so this stays cheap enough to
 * call on every request.
 *
 * A misconfigured or unreachable auth provider resolves to "signed out"
 * instead of throwing. That is deliberate: the previous provider outage took
 * every route down, including public ones, because a credential failure threw
 * at the edge.
 */
export const auth = cache(async (): Promise<{ userId: string | null }> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error) return { userId: null };
    return { userId: data?.claims?.sub ?? null };
  } catch (err) {
    // `cookies()` throws a framework-controlled error to signal that the
    // route must render dynamically. Swallowing it prerenders the route as
    // static with no session, so it has to be rethrown before this falls
    // back to "signed out".
    unstable_rethrow(err);
    return { userId: null };
  }
});

/** The signed-in user's id, or throws. For code paths that cannot continue without one. */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

/** The signed-in user's full profile, or null. Hits the auth server, so use sparingly. */
export const currentUser = cache(async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user;
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
});
