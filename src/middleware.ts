import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
  "/api/cron(.*)",
  "/api/plaid(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
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
