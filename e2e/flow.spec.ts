import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SCREENSHOT_DIR ?? "/workspace/ledgerfinesse/screenshots/v2";
mkdirSync(SHOTS, { recursive: true });

const COPY = {
  en: { found: "We found $640.00 owed back to you.", fee: "Upfront payment: $96.00 (15% of $640.00 owed).", pay: "Pay $96.00 & Unlock Dashboard", letter: "2. Formal Dispute & Demand Letter", tenDays: "ten (10) business days", notLawFirm: "not a law firm" },
  es: { found: "Encontramos $640.00 que te deben.", fee: "", pay: "", letter: "2. Carta formal de disputa y reclamación", tenDays: "diez (10) días hábiles", notLawFirm: "no es un despacho de abogados" },
} as const;

async function shot(page: Page, name: string) {
  const project = test.info().project.name;
  await page.screenshot({ path: path.join(SHOTS, `${name}-${project}.png`), fullPage: true });
}

for (const locale of ["en", "es"] as const) {
  test.describe(`${locale}`, () => {
    test(`landing: disclaimer, flat 15%, verified stats with sources, hreflang`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByTestId("disclaimer").first()).toContainText(COPY[locale].notLawFirm);
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/15\s*%\s*[–-]\s*25|1671/);
      expect(body).toContain("15%");
      expect(body).toContain("87%");
      await expect(page.locator('a[href^="https://www.ftc.gov"]')).toHaveCount(2);
      await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute("href", /\/es$/);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/en$/);
      const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
      expect(ld).toContain('"FAQPage"');
      await shot(page, `${locale}-01-landing`);
    });

    test(`scan → fee → unlock`, async ({ page }) => {
      const email = `e2e-${locale}-${test.info().project.name}-${Date.now()}@example.test`;
      await page.goto(`/${locale}/audits/new`);
      await page.waitForURL(new RegExp(`/${locale}/signin`));
      await shot(page, `${locale}-02-signin`);
      await page.locator('input[name="email"]').fill(email);
      await page.getByTestId("signin-submit").click();
      await page.waitForURL(new RegExp(`/${locale}/audits/new`));

      await expect(page.getByTestId("demo-note")).toBeVisible();
      await page.getByTestId("file-ledger").setInputFiles("e2e/fixtures/ledger.png");
      await page.getByTestId("file-lease").setInputFiles("e2e/fixtures/lease.pdf");
      await page.locator('input[name="landlordName"]').fill("Pacific Crest Residential Management LLC");
      await shot(page, `${locale}-03-upload`);
      await page.getByTestId("run-scan").click();

      await page.waitForURL(new RegExp(`/${locale}/audits/[0-9a-f-]{36}$`));
      await expect(page.getByTestId("free-total")).toHaveText("$640.00");
      if (locale === "en") {
        await expect(page.getByTestId("found-title")).toHaveText(COPY.en.found);
        await expect(page.getByTestId("fee-line")).toHaveText(COPY.en.fee);
        await expect(page.getByTestId("pay")).toHaveText(COPY.en.pay);
      } else {
        await expect(page.getByTestId("found-title")).toHaveText(COPY.es.found);
        await expect(page.getByTestId("fee-line")).toContainText("$96.00");
      }
      // Free result is count + total only: no line-level detail, no letter.
      const locked = await page.locator("main").innerText();
      expect(locked).not.toMatch(/RUBS|Valet|Late Charge|Pacific Crest/);
      await expect(page.getByTestId("disclaimer").first()).toContainText(COPY[locale].notLawFirm);
      await shot(page, `${locale}-04-result-fee-gate`);

      await page.getByTestId("pay").click();
      await page.waitForURL(/\/checkout\/mock\?session=cs_test_mock_/);
      await expect(page.getByTestId("mock-amount")).toHaveText("$96.00");
      await shot(page, `${locale}-05-mock-checkout`);
      await page.getByTestId("mock-pay").click();

      await page.waitForURL(new RegExp(`/${locale}/audits/[0-9a-f-]{36}`));
      await expect(page.getByTestId("report-total")).toHaveText("$640.00", { timeout: 15_000 });
      await expect(page.getByTestId("breakdown").locator("> li")).toHaveCount(5);
      await shot(page, `${locale}-06-unlocked-breakdown`);

      await page.getByRole("tab", { name: COPY[locale].letter }).click();
      await expect(page.getByTestId("attorney-review")).toBeVisible();
      await expect(page.getByTestId("letter")).toContainText(COPY[locale].tenDays);
      await expect(page.getByTestId("letter")).toContainText("Pacific Crest Residential Management LLC");
      await expect(page.getByTestId("letter")).toContainText(COPY[locale].notLawFirm);
      await shot(page, `${locale}-07-unlocked-letter`);
    });

    test(`sample dashboard is labeled SAMPLE and matches $640`, async ({ page }) => {
      await page.goto(`/${locale}/sample`);
      await expect(page.getByTestId("sample-banner")).toBeVisible();
      await expect(page.getByTestId("report-total")).toHaveText("$640.00");
      await page.getByRole("tab").nth(2).click();
      await expect(page.getByTestId("statutes")).toContainText("CA Civ. Code § 1671(d)");
      await shot(page, `${locale}-08-sample-sources`);
    });

    test(`blog: drafts flagged, sources listed, BlogPosting JSON-LD`, async ({ page }) => {
      await page.goto(`/${locale}/blog`);
      const first = page.locator("main h2 a").first();
      await first.click();
      await expect(page.getByTestId("draft-banner")).toBeVisible();
      await expect(page.getByTestId("sources").locator("li").first()).toBeVisible();
      const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
      expect(ld).toContain('"BlogPosting"');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await shot(page, `${locale}-09-blog-post`);
    });
  });
}

test("language switcher keeps the page", async ({ page, isMobile }) => {
  await page.goto("/en/sample");
  await page.getByTestId("language-switcher").getByRole("link", { name: "ES" }).click();
  await page.waitForURL(/\/es\/sample$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  expect(isMobile === undefined || typeof isMobile === "boolean").toBe(true);
});

test("unauthenticated webhook calls are rejected", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", { data: "{}", headers: { "stripe-signature": "t=1,v1=bad" } });
  expect(res.status()).toBe(400);
});
