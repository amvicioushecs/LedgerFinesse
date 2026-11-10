import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E against a production build with the local backends: memory store, dev sign-in,
 * demo extraction and mock Stripe (signed events through the real webhook handler).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/en`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_APP_URL: baseURL, SITE_ENV: "development", LF_BACKEND: "memory", STRIPE_MODE: "mock", EXTRACTION_MODE: "demo" },
  },
});
