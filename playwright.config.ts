import { defineConfig, devices } from "@playwright/test";

/**
 * Mobile layout regression suite.
 *
 * It exists because a dialog with no height cap was unusable on a phone for
 * as long as the app had existed, and nothing but a person holding an iPhone
 * would ever have found it. These checks are geometric rather than visual —
 * no screenshot baselines to churn — so they stay true as the design changes
 * and only fail when something genuinely stops fitting on a screen.
 */
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Layout assertions are deterministic; a retry would only hide a real flake.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // WebKit is the engine the reported bug was found on, and the one whose
    // viewport units behave differently from everyone else's. It leads.
    {
      name: "iphone-se",
      use: { ...devices["iPhone SE"] },
    },
    {
      name: "iphone-13",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
