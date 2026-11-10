import { defineConfig, devices } from "@playwright/test";

// E2E_TARGET=worker runs the same suite against the OpenNext worker in local workerd
// (`npm run build:cf` first). Nothing is deployed.
const onWorker = process.env.E2E_TARGET === "worker";
const PORT = Number(process.env.E2E_PORT ?? (onWorker ? 8788 : 3200));
const baseURL = `http://localhost:${PORT}`;
const localEnv = { SITE_ENV: "development", LF_BACKEND: "memory", STRIPE_MODE: "mock", EXTRACTION_MODE: "demo" };

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
    command: onWorker
      ? `npx wrangler dev --port ${PORT} ${Object.entries({ ...localEnv, NEXT_PUBLIC_APP_URL: baseURL })
          .map(([k, v]) => `--var ${k}:${v}`)
          .join(" ")}`
      : `npx next start -p ${PORT}`,
    url: `${baseURL}/en`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_APP_URL: baseURL, ...localEnv, WRANGLER_SEND_METRICS: "false" },
  },
});
