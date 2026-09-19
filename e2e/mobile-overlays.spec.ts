import { expect, test } from "@playwright/test";
import { enterDemoMode, expectOverlayUsable } from "./helpers";

const DIALOG = '[data-slot="dialog-content"]';
const SHEET = '[data-slot="sheet-content"]';

test.beforeEach(async ({ page }) => {
  await enterDemoMode(page);
});

test("the navigation sheet fits and scrolls", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /toggle menu/i }).click();
  await expectOverlayUsable(page, SHEET, "navigation sheet");
});

/**
 * The contribution editor is the form that broke: it is the tallest in the app
 * and the one whose height grew when employer and vesting fields were added.
 */
test("the contribution editor fits and can be saved", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const edit = page.locator("button:has(svg.lucide-pencil)").first();
  await expect(edit, "no contribution to edit — is the demo data seeded?").toBeVisible();
  await edit.click();

  await expectOverlayUsable(page, DIALOG, "edit contribution");

  const save = page.locator(DIALOG).getByRole("button", { name: /save/i });
  await save.scrollIntoViewIfNeeded();
  await expect(save, "the save button is not usable").toBeEnabled();
});

test("adding a contribution fits", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /add contribution/i }).first().click();
  await expectOverlayUsable(page, DIALOG, "add contribution");
});

test("adding an account fits", async ({ page }) => {
  await page.goto("/accounts", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /add account/i }).first().click();
  await expectOverlayUsable(page, DIALOG, "add account");
});

test("adding a holding fits", async ({ page }) => {
  await page.goto("/holdings", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /add holding/i }).first().click();
  await expectOverlayUsable(page, DIALOG, "add holding");
});

/**
 * A dialog taller than the screen must cap and scroll internally. Checked
 * directly rather than inferred, because a panel that merely happens to fit
 * today tells us nothing about the panel that grows tomorrow.
 */
test("an oversized dialog caps at the viewport instead of overflowing", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator("button:has(svg.lucide-pencil)").first().click();
  await page.locator(DIALOG).waitFor({ state: "visible" });

  const forced = await page.locator(DIALOG).evaluate((el) => {
    // Make the content far taller than any real form, then re-measure.
    const filler = document.createElement("div");
    filler.style.height = "4000px";
    el.appendChild(filler);
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      viewportH: window.innerHeight,
      scrolls: el.scrollHeight > el.clientHeight,
    };
  });

  expect(forced.top, "a tall dialog still starts above the screen").toBeGreaterThanOrEqual(0);
  expect(forced.bottom, "a tall dialog still runs past the bottom").toBeLessThanOrEqual(
    forced.viewportH
  );
  expect(forced.scrolls, "a tall dialog does not scroll its own content").toBe(true);
});
