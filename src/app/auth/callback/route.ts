import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Landing point for email confirmation and password-reset links. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Only same-origin paths — never redirect to a caller-supplied host.
  const requested = searchParams.get("next") ?? "/dashboard";
  const next =
    requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";

  const failed = (reason: string) =>
    NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(reason)}`
    );

  if (!code) return failed("That link is missing its confirmation code.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failed(error.message);

  return NextResponse.redirect(`${origin}${next}`);
}
