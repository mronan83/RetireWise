import { test } from "@playwright/test";
import {
  DASHBOARD_ROUTES,
  PUBLIC_ROUTES,
  enterDemoMode,
  expectFitsViewport,
} from "./helpers";

test.describe("public pages fit the screen", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      await expectFitsViewport(page, route);
    });
  }
});

test.describe("signed-in pages fit the screen", () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoMode(page);
  });

  for (const route of DASHBOARD_ROUTES) {
    test(`${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      // Charts and tables settle a frame or two after the network goes quiet.
      await page.waitForTimeout(600);
      await expectFitsViewport(page, route);
    });
  }

  test("/accounts/[accountId]", async ({ page }) => {
    await page.goto("/accounts", { waitUntil: "networkidle" });
    const firstAccount = page.locator('a[href^="/accounts/"]').first();
    await firstAccount.click();
    await page.waitForURL(/\/accounts\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await expectFitsViewport(page, "/accounts/[accountId]");
  });
});
