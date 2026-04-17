import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that require Clerk authentication (user-facing pages + user API routes)
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/accounts(.*)",
  "/holdings(.*)",
  "/transactions(.*)",
  "/net-worth(.*)",
  "/analysis(.*)",
  "/projections(.*)",
  "/settings(.*)",
  "/account(.*)",
  "/import(.*)",
  "/api/chat(.*)",
  "/api/analysis(.*)",
  "/api/prices(.*)",
  "/api/settings(.*)",
  "/api/alerts(.*)",
  "/api/export(.*)",
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
