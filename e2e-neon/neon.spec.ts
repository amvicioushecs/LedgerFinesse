import { neon } from "@neondatabase/serverless";
import { expect, test, type Page } from "@playwright/test";

/**
 * Neon dev branch: real Neon Auth sign-up/sign-in and Postgres. Emailed codes can't be read in a test (Neon Auth
 * stores them hashed and the addresses are @example.com), so email verification is done with a dev-branch fixture
 * (emailVerified = true) after asserting the app asked for a code.
 */
const sql = neon(process.env.DATABASE_URL!);
const fresh = (tag: string) => `lf-e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const PASSWORD = `e2e-${crypto.randomUUID()}`;

async function signUpVerified(page: Page, email: string, next = "/en/audits/new") {
  await page.goto(`/en/signin?next=${encodeURIComponent(next)}`);
  const form = page.getByTestId("password-form");
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(PASSWORD);
  await page.getByTestId("password-signup").click();
  await expect(page.getByTestId("password-status")).toBeVisible();
  await expect(page).toHaveURL(/status=confirm/);
  // The verify-code form is bound to this browser and shows the address it was sent to.
  await expect(page.getByTestId("code-form")).toContainText(email);
  await sql.query(`update neon_auth."user" set "emailVerified" = true where email = $1`, [email]);
}

async function passwordSignIn(page: Page, email: string, password = PASSWORD) {
  const form = page.getByTestId("password-form");
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(password);
  await page.getByTestId("password-signin").click();
}

test("unverified accounts can't sign in; verified ones scan, pay (mock) and unlock on Neon", async ({ page }) => {
  const email = fresh("flow");
  await signUpVerified(page, email);
  await sql.query(`update neon_auth."user" set "emailVerified" = false where email = $1`, [email]);
  await passwordSignIn(page, email);
  await expect(page).toHaveURL(/status=unconfirmed/);
  await expect(page.getByTestId("code-form")).toBeVisible();
  await sql.query(`update neon_auth."user" set "emailVerified" = true where email = $1`, [email]);

  await passwordSignIn(page, email);
  await page.waitForURL(/\/en\/audits\/new/);
  await page.getByTestId("file-ledger").setInputFiles("e2e/fixtures/ledger.png");
  await page.getByTestId("file-lease").setInputFiles("e2e/fixtures/lease.pdf");
  await page.locator('input[name="landlordName"]').fill("Pacific Crest Residential Management LLC");
  await page.getByTestId("run-scan").click();
  await page.waitForURL(/\/en\/audits\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("free-total")).toHaveText("$640.00");
  expect(await page.locator("main").innerText()).not.toMatch(/RUBS|Valet|Late Charge/);
  const auditUrl = page.url();

  const [{ n }] = (await sql.query(
    `select count(*)::int as n from public.audits a join neon_auth."user" u on u.id = a.user_id where u.email = $1 and a.status = 'preview_ready'`, [email],
  )) as { n: number }[];
  expect(n).toBe(1);

  await page.getByTestId("pay").click();
  await page.waitForURL(/\/checkout\/mock\?session=cs_test_mock_/);
  await page.getByTestId("mock-pay").click();
  await page.waitForURL(/\/en\/audits\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("report-total")).toHaveText("$640.00", { timeout: 15_000 });
  await expect(page.getByTestId("breakdown").locator("> li")).toHaveCount(5);

  // Another renter can't open this audit.
  const other = await page.context().browser()!.newContext();
  const otherPage = await other.newPage();
  const otherEmail = fresh("other");
  await signUpVerified(otherPage, otherEmail);
  await passwordSignIn(otherPage, otherEmail);
  await otherPage.waitForURL(/\/en\/audits\/new/);
  // The page streams (Suspense), so notFound() renders the not-found page after a 200; check what it shows.
  await otherPage.goto(auditUrl);
  await expect(otherPage.getByText(/could not be found/)).toBeVisible();
  await expect(otherPage.getByTestId("report-total")).toHaveCount(0);
  await expect(otherPage.getByTestId("free-total")).toHaveCount(0);
  expect(await otherPage.locator("body").innerText()).not.toMatch(/\$640|Pacific Crest|RUBS/);
  await other.close();

  // Sign-out ends the session server-side.
  await page.request.post("/auth/signout", { form: { locale: "en" }, headers: { origin: new URL(page.url()).origin } });
  await page.goto("/en/audits/new");
  await expect(page).toHaveURL(/\/en\/signin/);
});

test("five wrong passwords lock password sign-in for that email; the answer is the same whether or not it exists", async ({ page }) => {
  const email = fresh("lock");
  await signUpVerified(page, email);
  for (let i = 0; i < 5; i++) {
    await passwordSignIn(page, email, `wrong-${i}-${PASSWORD}`);
    await expect(page).toHaveURL(/status=invalid/);
  }
  await passwordSignIn(page, email);
  await expect(page).toHaveURL(/status=locked/);
  await passwordSignIn(page, fresh("nobody"), `wrong-${PASSWORD}`);
  await expect(page).toHaveURL(/status=invalid/);
});

test("sign-up refuses a password from breach data", async ({ page }) => {
  await page.goto("/en/signin");
  const form = page.getByTestId("password-form");
  await form.locator('input[name="email"]').fill(fresh("leaked"));
  await form.locator('input[name="password"]').fill("password123");
  await page.getByTestId("password-signup").click();
  await expect(page).toHaveURL(/status=leaked/);
});

test("a code can only be completed in the browser that asked for it", async ({ page, request }) => {
  // No pending cookie: refused without calling Neon Auth.
  const res = await request.post("/auth/code", { form: { code: "123456", locale: "en", next: "/en/audits" }, headers: { origin: "http://localhost:3500" }, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers().location).toMatch(/\/en\/signin\?status=expired/);

  // Email-code sign-in: the form appears only here, and a wrong code is refused.
  await page.goto("/en/signin");
  const email = fresh("code");
  await page.getByTestId("magic-form").locator('input[name="email"]').fill(email);
  await page.getByTestId("signin-submit").click();
  await expect(page).toHaveURL(/status=code/);
  await expect(page.getByTestId("code-form")).toContainText(email);
  await page.getByTestId("code-form").locator('input[name="code"]').fill("000000");
  await page.getByTestId("code-submit").click();
  await expect(page.getByTestId("code-status")).toBeVisible();
  // A forged pending cookie is ignored.
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "lf_code_pending", value: "eyJwIjoic2lnbmluIiwiZSI6ImFAZXhhbXBsZS5jb20iLCJ4Ijo5OTk5OTk5OTk5fQ.forged", domain: "localhost", path: "/" }]);
  await page.goto("/en/signin");
  await expect(page.getByTestId("code-form")).toHaveCount(0);
});

test("password reset uses an emailed code in the same browser", async ({ page }) => {
  await page.goto("/en/signin");
  await page.getByTestId("reset-form").locator('input[name="email"]').fill(fresh("reset"));
  await page.getByTestId("reset-submit").click();
  await page.waitForURL(/\/en\/reset-password\?status=reset_sent/);
  const form = page.getByTestId("reset-code-form");
  await form.locator('input[name="code"]').fill("000000");
  await form.locator('input[name="password"]').fill(PASSWORD);
  await page.getByTestId("update-password").click();
  await expect(page).toHaveURL(/status=code_invalid/);
  await expect(page.getByTestId("password-status")).toBeVisible();
  // Without the pending reset, the page sends you back to sign in.
  await page.context().clearCookies();
  await page.goto("/en/reset-password");
  await expect(page).toHaveURL(/\/en\/signin\?status=expired/);
});

/** Signs an lf_code_pending payload the way pending-code.ts does, so the test can make well-signed bad cookies. */
async function signedPending(payload: object): Promise<string> {
  const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64url");
  const body = b64(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`lf-pending-code:${process.env.NEON_AUTH_COOKIE_SECRET}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${body}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))))}`;
}

test("a pending code that is malformed, expired or has no expiry sends the reset page to status=expired (no cookie writes in the render)", async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  for (const value of ["garbage", await signedPending({ p: "reset", e: "a@example.com", x: now - 1 }), await signedPending({ p: "reset", e: "a@example.com" })]) {
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "lf_code_pending", value, domain: "localhost", path: "/" }]);
    const response = await page.goto("/en/reset-password");
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/en\/signin\?status=expired/);
  }
  // Control: the same signature with a live expiry shows the form.
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "lf_code_pending", value: await signedPending({ p: "reset", e: "a@example.com", x: now + 300 }), domain: "localhost", path: "/" }]);
  await page.goto("/en/reset-password");
  await expect(page.getByTestId("reset-code-form")).toContainText("a@example.com");
});

test("a session revoked in Neon Auth stops at once and the page render doesn't try to clear cookies", async ({ page }) => {
  const email = fresh("revoked");
  await signUpVerified(page, email);
  await passwordSignIn(page, email);
  await page.waitForURL(/\/en\/audits\/new/);
  await expect(page.getByTestId("file-ledger")).toBeAttached();
  // Revoke server-side (as an admin or a password reset would) and also keep the SDK's session-data cache cookie:
  // the page must ask Neon Auth, not trust the cache.
  await sql.query(`delete from neon_auth.session where "userId" = (select id from neon_auth."user" where email = $1)`, [email]);
  const response = await page.goto("/en/audits/new");
  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/en\/signin/);
  // Neon Auth asked for its cookies to be cleared; a page render can't do that, so they are left to expire.
  expect((await page.context().cookies()).some((c) => c.name === "__Secure-neon-auth.session_token")).toBe(true);
  await page.goto("/en/audits");
  await expect(page).toHaveURL(/\/en\/signin/);
});

test("Stripe TEST: sign up, sign in with a password, scan, pay on Stripe Checkout and unlock through the webhook", async ({ page }) => {
  test.skip(process.env.STRIPE_E2E !== "1", "run with scripts/e2e-neon-stripe.sh");
  test.setTimeout(150_000);
  const email = fresh("stripe");
  await signUpVerified(page, email);
  await passwordSignIn(page, email);
  await page.waitForURL(/\/en\/audits\/new/);
  await page.getByTestId("file-ledger").setInputFiles("e2e/fixtures/ledger.png");
  await page.getByTestId("file-lease").setInputFiles("e2e/fixtures/lease.pdf");
  await page.locator('input[name="landlordName"]').fill("Pacific Crest Residential Management LLC");
  await page.getByTestId("run-scan").click();
  await page.waitForURL(/\/en\/audits\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("free-total")).toHaveText("$640.00");
  const auditUrl = page.url();
  const auditId = auditUrl.split("/").pop()!;

  await page.getByTestId("pay").click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  // 15% of $640.00.
  await expect(page.getByText("$96.00").first()).toBeVisible({ timeout: 30_000 });
  // Dynamic payment methods: the card row's accordion button is an invisible overlay, so dispatch the click.
  const cardNumber = page.locator("#cardNumber");
  if (!(await cardNumber.isVisible().catch(() => false))) await page.getByTestId("card-accordion-item-button").dispatchEvent("click");
  await cardNumber.fill("4242 4242 4242 4242", { timeout: 20_000 });
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("E2E Renter");
  const zip = page.locator("#billingPostalCode");
  if (await zip.isVisible().catch(() => false)) await zip.fill("92101");
  // "Save my information with Link" is pre-checked and would ask for a phone number.
  const link = page.locator("#enableStripePass");
  if (await link.isChecked().catch(() => false)) await link.uncheck({ force: true });
  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL((url) => url.href.startsWith(auditUrl), { timeout: 60_000 });

  // The unlock comes only from the signed webhook (forwarded by stripe listen).
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("report-total")).toHaveText("$640.00", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByTestId("breakdown").locator("> li")).toHaveCount(5);
  const rows = (await sql.query(
    `select p.status, p.amount_cents::int as amount_cents, p.stripe_payment_intent_id is not null as has_pi, a.unlocked_at is not null as unlocked
     from public.payments p join public.audits a on a.id = p.audit_id where p.audit_id = $1`, [auditId],
  )) as { status: string; amount_cents: number; has_pi: boolean; unlocked: boolean }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: "paid", amount_cents: 9600, has_pi: true, unlocked: true });
});
