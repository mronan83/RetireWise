import { expect, test } from "@playwright/test";
import { DASHBOARD_ROUTES } from "./helpers";

/**
 * What a signed-out visitor gets from a signed-in page.
 *
 * The rest of this suite runs in demo mode, which bypasses the proxy
 * entirely — so every signed-in page is exercised only as someone who is
 * already authenticated. /onboarding shipped to production answering 500 to
 * signed-out visitors, and passed every check that existed, because nothing
 * ever asked for one of these pages without a session.
 *
 * A redirect to sign-in is the only acceptable answer. A 500 leaks that the
 * route exists and tells the visitor the app is broken when it is working.
 */
test.describe("signed out", () => {
  for (const route of DASHBOARD_ROUTES) {
    test(`${route} redirects to sign-in`, async ({ page }) => {
      // No demo cookie: this context has never been to /?demo=true.
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });

      expect(
        response?.status(),
        `${route} answered ${response?.status()} to a signed-out visitor`
      ).toBeLessThan(400);

      await expect(page, `${route} did not send a signed-out visitor to sign-in`).toHaveURL(
        /\/sign-in/
      );
    });
  }
});
