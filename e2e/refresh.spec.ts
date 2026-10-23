import { expect, test, type Page } from "@playwright/test";
import { enterDemoMode } from "./helpers";

/**
 * Installed on a home screen, the app has no browser reload button and no
 * native pull-to-refresh. Both of these must read the page's data again,
 * which in Next is a request for the route's server payload (an `RSC` header).
 */

const dataRequest = (page: Page) =>
  page.waitForRequest((r) => r.headers()["rsc"] === "1" && new URL(r.url()).pathname === "/dashboard", {
    timeout: 15_000,
  });

test.beforeEach(async ({ page }) => {
  await enterDemoMode(page);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
});

test("the refresh button reloads the page's data", async ({ page }) => {
  const button = page.getByTestId("app-refresh");
  await expect(button).toBeVisible();
  const request = dataRequest(page);
  await button.click();
  await request;
  await expect(button).toBeEnabled();
});

/** Drag a finger from y0 to y1 at the top of the page, then let go. */
async function pull(page: Page, y0: number, y1: number) {
  await page.evaluate(
    ({ y0, y1 }) => {
      const target = document.querySelector("main") ?? document.body;
      const touch = (y: number) =>
        new Touch({ identifier: 1, target, clientX: 160, clientY: y, pageX: 160, pageY: y });
      const fire = (type: string, y: number, ended = false) =>
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: ended ? [] : [touch(y)],
            targetTouches: ended ? [] : [touch(y)],
            changedTouches: [touch(y)],
          })
        );
      fire("touchstart", y0);
      for (let y = y0; y <= y1; y += 20) fire("touchmove", y);
      fire("touchend", y1, true);
    },
    { y0, y1 }
  );
}

test("pulling down from the top and letting go reloads the page's data", async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  const request = dataRequest(page);
  await pull(page, 120, 420);
  await request;
});

test("a short pull does not refresh", async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  let refreshed = false;
  page.on("request", (r) => {
    if (r.headers()["rsc"] === "1") refreshed = true;
  });
  await pull(page, 120, 160);
  await page.waitForTimeout(1_000);
  expect(refreshed, "a 40px pull should not refresh").toBe(false);
});
