import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { fill, getDictionary } from "@/content/dictionaries";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { currentLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locales";
import { getCurrentUser, passwordChangeAllowed } from "@/lib/server/runtime";
import { PRIVATE_ROBOTS } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await currentLocale());
  return { title: t.signup.password.resetTitle, robots: PRIVATE_ROBOTS };
}

/** Reached from the reset email through /auth/callback, which opened a recovery session. */
async function ResetForm({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/reset-password">["searchParams"] }) {
  const p = getDictionary(locale).signup.password;
  if (!(await getCurrentUser())) redirect(`/${locale}/signin?status=expired`);
  if (!(await passwordChangeAllowed())) redirect(`/${locale}/signin?status=reauth&next=${encodeURIComponent(`/${locale}/reset-password`)}`);
  const status = (await searchParams).status;
  return (
    <form action="/auth/update-password" method="post" className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="block">
        <span className="text-sm font-semibold">{p.newLabel}</span>
        <input type="password" name="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password"
          className="mt-1 block w-full rounded-md border border-line px-3 py-3 text-base" />
        <span className="mt-1 block text-xs text-muted">{fill(p.hint, { min: PASSWORD_MIN_LENGTH })}</span>
      </label>
      {status === "weak" || status === "rate" || status === "error" ? (
        <p role="alert" className="text-sm font-semibold text-alert" data-testid="password-status">
          {status === "weak" ? p.weak : status === "rate" ? getDictionary(locale).signup.rateLimited : p.updateError}
        </p>
      ) : null}
      <button type="submit" className="btn btn-gold w-full" data-testid="update-password">{p.save}</button>
    </form>
  );
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/[locale]/reset-password">) {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="font-display text-4xl font-bold">{t.signup.password.resetTitle}</h1>
      <div className="mt-8">
        <Suspense fallback={<p>{t.common.loading}</p>}>
          <ResetForm locale={locale} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
