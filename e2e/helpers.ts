import AxeBuilder from "@axe-core/playwright";
import Stripe from "stripe";
import { expect, test as base, type Browser, type Page } from "@playwright/test";

let ipCounter = 0;
export function uniqueIp() {
  ipCounter += 1;
  const n = (process.pid * 7919 + ipCounter + Date.now()) % 65000;
  return `198.18.${Math.floor(n / 250)}.${(n % 250) + 1}`;
}

export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.setExtraHTTPHeaders({ "cf-connecting-ip": uniqueIp() });
    await provide(context);
  },
});
export { expect };

export async function isolatedContext(browser: Browser, baseURL: string | undefined) {
  return browser.newContext({ baseURL, extraHTTPHeaders: { "cf-connecting-ip": uniqueIp() } });
}

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const SAMPLE_TOTAL = "$640.00";
export const SAMPLE_FEE = "$96.00";

/** Local mock-only secret (src/lib/payments/mock-gateway.ts). Not a real credential. */
const MOCK_WEBHOOK_SECRET = "whsec_local_mock_only";
const stripe = new Stripe("sk_test_local_mock_only", { httpClient: Stripe.createFetchHttpClient() });

export function uniqueEmail(tag: string) {
  const info = test.info();
  return `qa-${tag}-${info.project.name}-${info.workerIndex}-${Date.now()}@example.test`;
}

export async function signIn(page: Page, locale: Locale, email = uniqueEmail("user")) {
  await page.goto(`/${locale}/audits/new`);
  await page.waitForURL(new RegExp(`/${locale}/signin`));
  await page.getByTestId("magic-form").locator('input[name="email"]').fill(email);
  await page.getByTestId("signin-submit").click();
  await page.waitForURL(new RegExp(`/${locale}/audits/new`));
  await expect(page.getByTestId("run-scan")).toBeVisible();
  return email;
}

export async function scan(page: Page, locale: Locale): Promise<string> {
  await page.getByTestId("file-ledger").setInputFiles("e2e/fixtures/ledger.png");
  await page.getByTestId("file-lease").setInputFiles("e2e/fixtures/lease.pdf");
  await page.locator('input[name="landlordName"]').fill("Test Landlord Holdings LLC");
  await page.getByTestId("run-scan").click();
  await page.waitForURL(new RegExp(`/${locale}/audits/[0-9a-f-]{36}$`));
  await expect(page.getByTestId("free-total")).toHaveText(SAMPLE_TOTAL);
  return new URL(page.url()).pathname.split("/").pop()!;
}

export async function openCheckout(page: Page): Promise<string> {
  await page.getByTestId("pay").click();
  await page.waitForURL(/\/checkout\/mock\?session=cs_test_mock_/);
  return new URL(page.url()).searchParams.get("session")!;
}

export function signedCheckoutEvent(opts: {
  sessionId: string;
  auditId: string;
  amountCents: number;
  paymentStatus?: string;
  eventId?: string;
  type?: string;
}) {
  const rawBody = JSON.stringify({
    id: opts.eventId ?? `evt_qa_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
    object: "event",
    type: opts.type ?? "checkout.session.completed",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: opts.sessionId,
        object: "checkout.session",
        amount_total: opts.amountCents,
        currency: "usd",
        payment_status: opts.paymentStatus ?? "paid",
        status: "complete",
        payment_intent: `pi_qa_${opts.sessionId.slice(-12)}`,
        client_reference_id: opts.auditId,
        metadata: { audit_id: opts.auditId },
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: MOCK_WEBHOOK_SECRET });
  return { rawBody, signature };
}

export async function postWebhook(page: Page, event: { rawBody: string; signature: string }) {
  return page.request.post("/api/stripe/webhook", {
    data: event.rawBody,
    headers: { "content-type": "application/json", "stripe-signature": event.signature },
  });
}

/** WCAG 2.0/2.1 A + AA. Attaches violations; contrast is included in wcag2aa. */
export async function expectNoAxeViolations(page: Page, label: string) {
  await page.waitForLoadState("load");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(" "), summary: n.failureSummary })),
  }));
  await test.info().attach(`axe-${label}.json`, { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

/**
 * Visible interactive controls smaller than 44x44 CSS px. Inline links inside running
 * text (p/li/td) are exempt, as in WCAG 2.5.5.
 */
export async function smallTouchTargets(page: Page) {
  return page.evaluate(() => {
    const sel = 'a[href], button, input:not([type="hidden"]):not(.sr-only), select, textarea, [role="tab"], [role="button"], label:has(input[type="file"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || el.closest("[hidden]")) continue;
      const target = el.tagName === "INPUT" && el.closest("label") ? el.closest("label")! : el;
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.classList.contains("sr-only")) continue;
      if (el.tagName === "A" && el.closest("p, li, td, pre, time") && !el.classList.contains("btn")) {
        const block = el.closest("p, li, td, pre")!;
        if ((block.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 3) continue;
      }
      if (r.width < 44 || r.height < 44) {
        const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
}

export async function headMeta(page: Page) {
  return page.evaluate(() => {
    const meta = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.content ?? null;
    return {
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
      ogUrl: meta('meta[property="og:url"]'),
      ogSiteName: meta('meta[property="og:site_name"]'),
      ogLocale: meta('meta[property="og:locale"]'),
      ogType: meta('meta[property="og:type"]'),
    };
  });
}
