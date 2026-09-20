import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// User-facing pages and API routes that require a signed-in user.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/accounts",
  "/holdings",
  "/transactions",
  "/net-worth",
  "/analysis",
  "/projections",
  "/analytics",
  "/settings",
  "/account",
  "/import",
  "/help",
  "/api/chat",
  "/api/analysis",
  "/api/prices",
  "/api/settings",
  "/api/alerts",
  "/api/export",
  "/api/report",
  "/api/household",
  "/api/billing",
  "/api/irs-limits",
];

// Machine-to-machine routes with their own auth (bearer token, webhook
// signature). These must never be session-gated or cron and webhooks break.
const MACHINE_PREFIXES = [
  "/api/cron",
  "/api/plaid/webhook",
  "/api/billing/webhook",
  "/api/health",
];

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

// Opt in, not out. Demo mode returns NextResponse.next() for every protected
// path — an authentication bypass shaped like a feature. It is correct today
// (writes are refused by requireWriteClerkId, and it reads a seeded
// household), but a bypass that is on unless someone remembers to turn it off
// is the wrong default for a deployment real families use.
const demoEnabled = () => process.env.NEXT_PUBLIC_DEMO_ENABLED === "true";

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const path = url.pathname;

  // Demo mode entry: /?demo=true → set cookie, land on the dashboard.
  if (url.searchParams.get("demo") === "true" && demoEnabled()) {
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set("demo", "1", {
      path: "/",
      maxAge: 3600,
      sameSite: "lax",
    });
    return response;
  }

  // Demo mode exit: /?demo=false → clear cookie, back to the landing page.
  if (url.searchParams.get("demo") === "false") {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("demo");
    return response;
  }

  // Demo mode and machine-to-machine routes skip session handling entirely.
  // Returned explicitly rather than falling out of the function: Next only
  // documents returning a NextResponse.
  if (demoEnabled() && request.cookies.get("demo")?.value === "1") {
    return NextResponse.next();
  }
  if (matches(path, MACHINE_PREFIXES)) return NextResponse.next();

  // Supabase may rotate the access token while reading it. Those cookies have
  // to reach both the downstream render (so it sees the fresh token) and the
  // browser (so the next request does), and the response must not be cached.
  const pendingCookies: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];
  let pendingHeaders: Record<string, string> = {};

  const finalize = (response: NextResponse) => {
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }
    for (const [name, value] of Object.entries(pendingHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  };

  let userId: string | null = null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            for (const cookie of cookiesToSet) {
              request.cookies.set(cookie.name, cookie.value);
              pendingCookies.push({
                name: cookie.name,
                value: cookie.value,
                options: cookie.options as Record<string, unknown>,
              });
            }
            pendingHeaders = { ...pendingHeaders, ...headers };
          },
        },
      });

      const { data } = await supabase.auth.getClaims();
      userId = data?.claims?.sub ?? null;
    }
  } catch {
    // Auth is unreachable or misconfigured. Fall through as signed out rather
    // than throwing: a credential failure here previously returned 500 for
    // every route in the app, public pages included.
    userId = null;
  }

  if (!userId && matches(path, PROTECTED_PREFIXES)) {
    if (path.startsWith("/api/")) {
      return finalize(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", `${path}${url.search}`);
    return finalize(NextResponse.redirect(signIn));
  }

  return finalize(
    NextResponse.next({ request: { headers: request.headers } })
  );
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
