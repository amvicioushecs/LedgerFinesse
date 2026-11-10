import { LOCALES, expect, expectNoAxeViolations, headMeta, isolatedContext, openCheckout, postWebhook, scan, signIn, signedCheckoutEvent, smallTouchTargets, test, type Locale } from "./helpers";

test.describe.configure({ mode: "default" });

for (const locale of LOCALES) {
  test.describe(`${locale} QA paywall gaps`, () => {
    test(`async payment failure: reload of ?checkout=success shows the preview and Try payment again`, async ({ page }) => {
      await signIn(page, locale);
      const auditId = await scan(page, locale);
      const sessionId = await openCheckout(page);
      await postWebhook(page, signedCheckoutEvent({ sessionId, auditId, amountCents: 9600, paymentStatus: "unpaid" }));
      await page.goto(`/${locale}/audits/${auditId}?checkout=success`);
      await expect(page.getByTestId("payment-pending")).toBeVisible();
      const failed = await postWebhook(page, signedCheckoutEvent({ sessionId, auditId, amountCents: 9600, paymentStatus: "unpaid", type: "checkout.session.async_payment_failed" }));
      expect(await failed.json()).toMatchObject({ outcome: "failed" });
      await page.reload();
      await expect(page.getByTestId("payment-pending")).toHaveCount(0);
      await expect(page.getByTestId("pay")).toBeVisible();
      await expect(page.getByTestId("pay")).toHaveText(locale === "en" ? /try payment again/i : /intenta pagar de nuevo/i);
    });

    test(`cancelled checkout offers Try payment again`, async ({ page }) => {
      await signIn(page, locale);
      const auditId = await scan(page, locale);
      await openCheckout(page);
      await page.goto(`/${locale}/audits/${auditId}?checkout=cancel`);
      await expect(page.getByTestId("payment-pending")).toHaveCount(0);
      await expect(page.getByTestId("pay")).toHaveText(locale === "en" ? /try payment again/i : /intenta pagar de nuevo/i);
    });

    test(`another user's audit URL answers HTTP 404, not a soft 404`, async ({ page, browser }) => {
      await signIn(page, locale);
      const auditId = await scan(page, locale);
      const other = await isolatedContext(browser, test.info().project.use.baseURL);
      const p2 = await other.newPage();
      await signIn(p2, locale);
      const res = await p2.goto(`/${locale}/audits/${auditId}`);
      await expect(p2.getByText("This page could not be found.")).toBeVisible();
      await expect(p2.getByTestId("free-total")).toHaveCount(0);
      expect((await p2.content())).not.toContain("$640.00");
      expect(res?.status()).toBe(404);
      await other.close();
    });

    test(`preview shows a Not legal advice notice`, async ({ page }) => {
      await signIn(page, locale);
      await scan(page, locale);
      await expect(page.getByTestId("disclaimer").first()).toContainText(
        locale === "en" ? /not legal advice/i : /no (es|constituye) asesor[ií]a legal/i,
      );
    });
  });
}

for (const locale of LOCALES) {
  test(`${locale} landing: og:url matches canonical`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const h = await headMeta(page);
    expect(h.ogUrl, "og:url").toBe(h.canonical);
  });

  test(`${locale} blog index: og:url matches canonical`, async ({ page }) => {
    await page.goto(`/${locale}/blog`);
    const h = await headMeta(page);
    expect(h.ogUrl, "og:url").toBe(h.canonical);
  });

  test(`${locale} blog posts: og:site_name LedgerFinesse and og:locale in regional format`, async ({ page }) => {
    await page.goto(`/${locale}/blog`);
    const hrefs = await page.locator(`main h2 a[href^="/${locale}/blog/"]`).evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const path of hrefs) {
      await page.goto(path);
      const h = await headMeta(page);
      expect(h.ogSiteName, `${path} og:site_name`).toBe("LedgerFinesse");
      expect(h.ogLocale, `${path} og:locale`).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
      expect(h.ogUrl, path).toBeTruthy();
    }
  });
}

test("logo accessible name includes the visible LedgerFinesse text", async ({ page }) => {
  await page.goto("/en");
  const logo = page.locator("header a").filter({ hasText: "LedgerFinesse" }).first();
  await expect(logo).toBeVisible();
  const name = await logo.evaluate((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim());
  expect(name).toMatch(/LedgerFinesse/);
  const label = await logo.getAttribute("aria-label");
  if (label) expect(label).toContain("LedgerFinesse");
});

const A11Y_SCREENS: { name: string; open: (page: import("@playwright/test").Page, locale: Locale) => Promise<void> }[] = [
  { name: "landing", open: async (p, l) => void (await p.goto(`/${l}`)) },
  { name: "signin", open: async (p, l) => void (await p.goto(`/${l}/signin`)) },
  { name: "blog-index", open: async (p, l) => void (await p.goto(`/${l}/blog`)) },
  { name: "preview", open: async (p, l) => { await signIn(p, l); await scan(p, l); } },
];

for (const locale of LOCALES) {
  for (const screen of A11Y_SCREENS) {
    test(`${locale} ${screen.name}: axe WCAG 2.1 AA (includes contrast)`, async ({ page }) => {
      await screen.open(page, locale);
      await expectNoAxeViolations(page, `${locale}-${screen.name}`);
    });

    test(`${locale} ${screen.name}: touch targets >= 44px on mobile`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "mobile project only");
      await screen.open(page, locale);
      const small = await smallTouchTargets(page);
      await test.info().attach(`small-targets-${locale}-${screen.name}.json`, { body: JSON.stringify(small, null, 2), contentType: "application/json" });
      expect(small, `controls under 44x44 on ${screen.name}`).toEqual([]);
    });
  }
}

test("language toggle: 44x44 segments, 8px gap, aria-current plus underline", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");
  await page.goto("/en");
  const nav = page.getByTestId("language-switcher");
  const en = nav.getByRole("link", { name: "EN" });
  const es = nav.getByRole("link", { name: "ES" });
  await expect(en).toHaveAttribute("aria-current", "true");
  await expect(es).not.toHaveAttribute("aria-current");
  const metrics = await nav.evaluate((root) => {
    const links = [...root.querySelectorAll("a")];
    const boxes = links.map((a) => a.getBoundingClientRect());
    const current = links.find((a) => a.getAttribute("aria-current") === "true");
    const style = current ? getComputedStyle(current) : null;
    return {
      sizes: boxes.map((b) => ({ w: Math.round(b.width), h: Math.round(b.height) })),
      gap: boxes.length === 2 ? Math.round(boxes[1]!.left - boxes[0]!.right) : 0,
      underline: style ? style.textDecorationLine.includes("underline") || style.textDecoration.includes("underline") : false,
    };
  });
  for (const s of metrics.sizes) {
    expect(s.w, "language segment width").toBeGreaterThanOrEqual(44);
    expect(s.h, "language segment height").toBeGreaterThanOrEqual(44);
  }
  expect(metrics.gap, "gap between language segments").toBeGreaterThanOrEqual(8);
  expect(metrics.underline, "current language is underlined, not color alone").toBe(true);
});
