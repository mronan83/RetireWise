import { expect, test } from "@playwright/test";
import { enterDemoMode } from "./helpers";

/**
 * The control that links a debt to the asset securing it.
 *
 * This shipped invisible. The picker is rendered by the debt form, guarded on
 * the household having assets to offer — and the net worth page passed the
 * debts section `properties={[]} vehicles={[]}`, because the row lists were
 * gated by array length and every caller had to blank the lists its section
 * did not show. The guard saw nothing to offer and the feature could not be
 * reached from anywhere in the app.
 *
 * No unit test could have caught that: the component, the action and the
 * composer were all correct in isolation. Only opening the form finds it, so
 * that is what this does.
 */
test.describe("securing a debt against an asset", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?demo=true");
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await page.goto("/net-worth");
  });

  test("the debt form offers the household's assets", async ({ page }) => {
    // The add button is labelled per section, so it identifies the debts form
    // without depending on how the section's card heading is marked up — the
    // first version of this test looked for a `heading` role that CardTitle
    // does not render, and failed for that rather than for the feature.
    await page.getByRole("button", { name: "Add Debt" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const picker = dialog.getByTestId("secured-by");
    await expect(
      picker,
      "the debt form has no way to name the asset a loan is secured against — " +
        "the picker is guarded on the household having assets, and the page " +
        "passed it none"
    ).toBeVisible();

    // And it must actually list them. A picker whose only option is
    // "not secured" is the same dead end wearing a label.
    await picker.click();
    const options = page.getByRole("option");
    await expect
      .poll(() => options.count(), {
        message: "the picker opened with no assets to choose from",
      })
      .toBeGreaterThan(1);

    const labels = await options.allInnerTexts();
    expect(
      labels.some((l) => /property/i.test(l)),
      `the household's property is not offered — got ${JSON.stringify(labels)}`
    ).toBe(true);
    expect(
      labels.some((l) => /vehicle/i.test(l)),
      `the household's vehicles are not offered — got ${JSON.stringify(labels)}`
    ).toBe(true);
  });

  test("each section shows only its own items", async ({ page }) => {
    // The debts section is now given the household's properties and vehicles
    // so its form can offer them. They must not appear as rows in it — which
    // is what would happen if the lists were still gated on array length.
    const debtSection = page.locator('[data-testid="nw-section"][data-section="debt"]');
    await expect(debtSection).toBeAttached();

    const debtText = await debtSection.innerText();
    expect(debtText, "the debts section should list the debts").toContain("Student Loan");
    expect(
      debtText,
      "a property is being rendered inside the debts section — passing assets " +
        "to it for the form's picker must not leak them into its list"
    ).not.toContain("Primary Residence");
    expect(debtText).not.toContain("2019 Honda Accord");

    const propertySection = page.locator('[data-testid="nw-section"][data-section="real_estate"]');
    expect(
      await propertySection.innerText(),
      "the property still belongs in its own section"
    ).toContain("Primary Residence");
  });
});
