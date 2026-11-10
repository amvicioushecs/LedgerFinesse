import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDictionary } from "@/content/dictionaries";
import { serverEnv } from "@/lib/env";
import type { Locale } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { formatUsd } from "@/lib/money";
import { mockGateway } from "@/lib/server/runtime";
import { PRIVATE_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = { title: "Test checkout", robots: PRIVATE_ROBOTS };

const COPY = {
  en: { title: "Test checkout (Stripe mock)", note: "Local test mode. No card is charged and no Stripe account is used.", pay: "Pay {fee} (test)", cancel: "Cancel" },
  es: { title: "Pago de prueba (simulación de Stripe)", note: "Modo de prueba local. No se cobra ninguna tarjeta ni se usa una cuenta de Stripe.", pay: "Pagar {fee} (prueba)", cancel: "Cancelar" },
} as const;

async function MockCheckout({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/checkout/mock">["searchParams"] }) {
  if (serverEnv().stripeMode !== "mock") notFound();
  const { session } = await searchParams;
  const info = typeof session === "string" ? mockGateway().describe(session) : null;
  if (!info || typeof session !== "string") notFound();
  const c = COPY[locale];
  return (
    <div className="rounded-lg border border-line p-6">
      <p className="font-display text-4xl font-bold" data-testid="mock-amount">{formatUsd(info.amountCents)}</p>
      <p className="mt-1 text-sm text-muted">15% · {formatUsd(info.totalOwedCents)}</p>
      <form action="/api/checkout/mock" method="post" className="mt-6 flex flex-wrap gap-3">
        <input type="hidden" name="session" value={session} />
        <button className="btn btn-forest" data-testid="mock-pay">{c.pay.replace("{fee}", formatUsd(info.amountCents))}</button>
        <a href={info.cancelUrl} className="btn btn-outline">{c.cancel}</a>
      </form>
    </div>
  );
}

export default async function MockCheckoutPage({ searchParams }: PageProps<"/[locale]/checkout/mock">) {
  const locale = await currentLocale();
  const c = COPY[locale];
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <p className="pill bg-butter text-alert">TEST MODE</p>
      <h1 className="font-display mt-3 text-3xl font-bold">{c.title}</h1>
      <p className="mt-2 text-sm text-muted">{c.note}</p>
      <div className="mt-6">
        <Suspense fallback={<p>{getDictionary(locale).common.loading}</p>}>
          <MockCheckout locale={locale} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
