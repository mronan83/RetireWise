import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Routes that require Clerk authentication (user-facing pages + user API routes)
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/accounts(.*)",
  "/holdings(.*)",
  "/transactions(.*)",
  "/net-worth(.*)",
  "/analysis(.*)",
  "/projections(.*)",
  "/analytics(.*)",
  "/settings(.*)",
  "/account(.*)",
  "/import(.*)",
  "/api/chat(.*)",
  "/api/analysis(.*)",
  "/api/prices(.*)",
  "/api/settings(.*)",
  "/api/alerts(.*)",
  "/api/export(.*)",
  "/api/report(.*)",
  "/api/household(.*)",
  "/api/irs-limits(.*)",
]);

// Machine-to-machine routes that use their own auth (bearer token, webhook signature)
// These must NOT be Clerk-gated or cron/webhooks will be rejected
const isMachineRoute = createRouteMatcher([
  "/api/cron(.*)",
  "/api/plaid/webhook(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const url = req.nextUrl;

  // Demo mode entry: /?demo=true → set cookie, redirect to /dashboard
  if (url.searchParams.get("demo") === "true" && process.env.NEXT_PUBLIC_DEMO_ENABLED !== "false") {
    const response = NextResponse.redirect(new URL("/dashboard", req.url));
    response.cookies.set("demo", "1", {
      path: "/",
      maxAge: 3600, // 1 hour
      sameSite: "lax",
    });
    return response;
  }

  // Demo mode exit: /?demo=false → clear cookie, redirect to /
  if (url.searchParams.get("demo") === "false") {
    const response = NextResponse.redirect(new URL("/", req.url));
    response.cookies.delete("demo");
    return response;
  }

  // If demo cookie is set, skip Clerk auth for protected routes
  const isDemo = req.cookies.get("demo")?.value === "1";
  if (isDemo && process.env.NEXT_PUBLIC_DEMO_ENABLED !== "false") {
    return; // Allow through without auth
  }

  // Skip Clerk auth for machine-to-machine endpoints
  if (isMachineRoute(req)) return;

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
