import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against `next start` with LF_BACKEND=neon on a Neon DEV branch (real Postgres and Neon Auth), mock Stripe and
 * demo extraction (or real Stripe TEST mode with STRIPE_E2E=1, see scripts/e2e-neon-stripe.sh). Needs DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET and NEON_BRANCH=dev-* in the
 * environment (from `neon env pull --file <outside the repo>`); refuses any other branch.
 */
if (!process.env.NEON_BRANCH?.startsWith("dev-")) throw new Error("Neon e2e runs only against a dev-* branch (NEON_BRANCH)");
for (const key of ["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"]) {
  if (!process.env[key]) throw new Error(`${key} is required for the Neon e2e`);
}
// STRIPE_E2E=1 (scripts/e2e-neon-stripe.sh): real Stripe TEST mode with webhooks forwarded by `stripe listen`.
const stripeE2e = process.env.STRIPE_E2E === "1";
if (stripeE2e && !/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "")) throw new Error("STRIPE_E2E needs a test-mode STRIPE_SECRET_KEY");
if (stripeE2e && !process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_E2E needs STRIPE_WEBHOOK_SECRET (from stripe listen)");
const PORT = Number(process.env.E2E_PORT ?? 3500);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e-neon",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/en`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_APP_URL: baseURL, SITE_ENV: "development", LF_BACKEND: "neon", EXTRACTION_MODE: "demo",
      ...(stripeE2e
        ? { STRIPE_MODE: "stripe", STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!, STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET! }
        : { STRIPE_MODE: "mock" }),
      DATABASE_URL: process.env.DATABASE_URL!, NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL!, NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET!,
    },
  },
});
