import type { Metadata } from "next";
import { Suspense } from "react";
import { fill, getDictionary } from "@/content/dictionaries";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { safeNextPath } from "@/lib/auth/safe-next";
import { currentLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locales";
import { PRIVATE_ROBOTS } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await currentLocale());
  return { title: t.signup.title, robots: PRIVATE_ROBOTS };
}

async function SignInForm({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/signin">["searchParams"] }) {
  const t = getDictionary(locale);
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null, locale);
  const status = typeof params.status === "string" ? params.status : null;
  if (status === "sent") {
    return (
      <p role="status" className="rounded-md bg-mint p-4 font-semibold" data-testid="signin-sent">
        {t.signup.sent} <span className="font-normal">{t.signup.passwordless}</span>
      </p>
    );
  }
  const p = t.signup.password;
  const passwordStatus: Record<string, string> = {
    invalid: p.invalid, locked: p.locked, reauth: p.reauth, unconfirmed: p.unconfirmed, weak: fill(p.weak, { min: PASSWORD_MIN_LENGTH }), confirm: p.confirmSent,
    reset_sent: p.resetSent, expired: p.expired, confirmed_signin: p.confirmedSignIn, recovery_cancelled: p.confirmCancelled,
  };
  const statusIsNotice = status === "confirm" || status === "reset_sent" || status === "confirmed_signin" || status === "recovery_cancelled";
  const inputClass = "mt-1 block w-full rounded-md border border-line px-3 py-3 text-base";
  return (
    <div className="space-y-8">
      <form action="/auth/signin" method="post" className="space-y-4" data-testid="magic-form">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="locale" value={locale} />
        <label className="block">
          <span className="text-sm font-semibold">{t.signup.emailLabel}</span>
          <input type="email" name="email" required maxLength={320} autoComplete="email" inputMode="email" placeholder={t.signup.emailPlaceholder} className={inputClass} />
        </label>
        {status === "error" || status === "rate" || status === "unavailable" ? (
          <p role="alert" className="text-sm font-semibold text-alert">
            {status === "rate" ? t.signup.rateLimited : status === "unavailable" ? t.common.unavailable : t.signup.error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-gold w-full" data-testid="signin-submit">
          {t.signup.submit}
        </button>
        <p className="text-xs text-muted">{t.signup.passwordless}</p>
      </form>

      <form action="/auth/password" method="post" className="space-y-4 border-t border-line pt-6" data-testid="password-form">
        <p className="text-sm font-semibold">{p.heading}</p>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="locale" value={locale} />
        <label className="block">
          <span className="text-sm font-semibold">{t.signup.emailLabel}</span>
          <input type="email" name="email" required maxLength={320} autoComplete="email" inputMode="email" placeholder={t.signup.emailPlaceholder} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{p.label}</span>
          <input type="password" name="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="current-password" className={inputClass} />
          <span className="mt-1 block text-xs text-muted">{fill(p.hint, { min: PASSWORD_MIN_LENGTH })}</span>
        </label>
        {status && passwordStatus[status] ? (
          <p role={statusIsNotice ? "status" : "alert"} data-testid="password-status"
            className={statusIsNotice ? "rounded-md bg-mint p-3 text-sm font-semibold" : "text-sm font-semibold text-alert"}>
            {passwordStatus[status]}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" name="intent" value="signin" className="btn btn-gold w-full sm:flex-1" data-testid="password-signin">{p.signIn}</button>
          <button type="submit" name="intent" value="signup" className="btn btn-outline w-full sm:flex-1" data-testid="password-signup">{p.signUp}</button>
        </div>
      </form>

      <form action="/auth/reset" method="post" className="space-y-3 border-t border-line pt-6" data-testid="reset-form">
        <p className="text-sm font-semibold">{p.forgot}</p>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="locale" value={locale} />
        <label className="block">
          <span className="text-sm font-semibold">{t.signup.emailLabel}</span>
          <input type="email" name="email" required maxLength={320} autoComplete="email" inputMode="email" placeholder={t.signup.emailPlaceholder} className={inputClass} />
        </label>
        <button type="submit" className="btn btn-outline w-full" data-testid="reset-submit">{p.sendReset}</button>
      </form>
    </div>
  );
}

export default async function SignInPage({ searchParams }: PageProps<"/[locale]/signin">) {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <p className="pill bg-mint text-forest">{t.signup.badge}</p>
      <h1 className="font-display mt-4 text-4xl font-bold">{t.signup.title}</h1>
      <p className="mt-3 text-muted">{t.signup.lead}</p>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-forest">
        <li className="pill bg-cream">✓ {t.signup.noCard}</li>
        <li className="pill bg-cream">✓ {t.signup.noPaperwork}</li>
      </ul>
      <div className="mt-8">
        <Suspense fallback={<p>{t.common.loading}</p>}>
          <SignInForm locale={locale} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
