import { expect, test } from "@playwright/test";
import { enterDemoMode } from "./helpers";

/**
 * The free tier has to actually be free.
 *
 * Every entitlement check in the app currently returns "allowed", which makes
 * them invisible: a broken guard and a working guard look identical from the
 * outside. These assertions are what tells the difference. If someone narrows
 * the free plan by accident, or a guard starts refusing because a lookup
 * failed rather than because a limit was hit, this is where it surfaces —
 * rather than in a message from a relative who cannot open their dashboard.
 */

const FEATURE_COUNT = 8;

test.describe("free tier", () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoMode(page);
  });

  test("grants every feature with no limits", async ({ page }) => {
    const res = await page.request.get("/api/billing/status");
    expect(res.ok(), "billing status should be readable while signed in").toBe(true);

    const body = await res.json();
    expect(body.billingEnabled, "billing is dormant on this deployment").toBe(false);
    expect(body.current.planId).toBe("free");
    expect(body.current.source).toBe("billing_disabled");
    expect(
      body.features.length,
      `every feature should be included — got ${body.features.map((f: { id: string }) => f.id).join(", ")}`
    ).toBe(FEATURE_COUNT);
    expect(
      Object.values(body.limits).filter((v) => v !== null),
      "the free tier should carry no numeric limits"
    ).toEqual([]);
  });

  test("checkout refuses cleanly while billing is off", async ({ page }) => {
    const res = await page.request.post("/api/billing/checkout", {
      data: { planId: "plus" },
      failOnStatusCode: false,
    });
    // 503, not 500: billing being off is a known state, not a crash.
    expect(res.status()).toBe(503);
    expect((await res.json()).code).toBe("billing_disabled");
  });

  test("the plan is visible in Settings", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });
    await expect(page.getByText("Plan & Billing")).toBeVisible();
  });
});

test.describe("AI provider", () => {
  test("reports no key rather than a server fallback", async ({ page }) => {
    await enterDemoMode(page);
    const res = await page.request.get("/api/settings/ai-provider");
    expect(res.ok()).toBe(true);
    const body = await res.json();

    // "server" used to be a possible source, meaning the app operator's key
    // paid for this household's inference. It must no longer be reachable.
    for (const [provider, info] of Object.entries(body.keys ?? {})) {
      expect(
        (info as { source: string }).source,
        `${provider} must be backed by the household's own key or none at all`
      ).not.toBe("server");
    }
  });
});
