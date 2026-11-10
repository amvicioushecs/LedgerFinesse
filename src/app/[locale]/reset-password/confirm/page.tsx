import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { fill, getDictionary } from "@/content/dictionaries";
import { currentLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locales";
import { pendingRecoveryEmail } from "@/lib/server/runtime";
import { PRIVATE_ROBOTS } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await currentLocale());
  return { title: t.signup.password.confirmTitle, robots: PRIVATE_ROBOTS };
}

/** Shown after a recovery link is verified and before its session is set, so nobody is signed into someone else's account. */
async function ConfirmForm({ locale }: { locale: Locale }) {
  const p = getDictionary(locale).signup.password;
  const email = await pendingRecoveryEmail();
  if (!email) redirect(`/${locale}/signin?status=expired`);
  return (
    <form action="/auth/recovery" method="post" className="space-y-4" data-testid="recovery-confirm">
      <input type="hidden" name="locale" value={locale} />
      <p>{fill(p.confirmBody, { email })}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" name="action" value="continue" className="btn btn-gold w-full sm:flex-1">{fill(p.confirmContinue, { email })}</button>
        <button type="submit" name="action" value="cancel" className="btn btn-outline w-full sm:flex-1">{p.confirmCancel}</button>
      </div>
    </form>
  );
}

export default async function RecoveryConfirmPage() {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="font-display text-4xl font-bold">{t.signup.password.confirmTitle}</h1>
      <div className="mt-8">
        <Suspense fallback={<p>{t.common.loading}</p>}>
          <ConfirmForm locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}
