import type { Metadata } from "next";
import { Suspense } from "react";
import { getDictionary } from "@/content/dictionaries";
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
  return (
    <form action="/auth/signin" method="post" className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="locale" value={locale} />
      <label className="block">
        <span className="text-sm font-semibold">{t.signup.emailLabel}</span>
        <input
          type="email"
          name="email"
          required
          maxLength={320}
          autoComplete="email"
          inputMode="email"
          placeholder={t.signup.emailPlaceholder}
          className="mt-1 block w-full rounded-md border border-line px-3 py-3 text-base"
        />
      </label>
      {status === "error" ? (
        <p role="alert" className="text-sm font-semibold text-alert">
          {t.signup.error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-gold w-full" data-testid="signin-submit">
        {t.signup.submit}
      </button>
      <p className="text-xs text-muted">{t.signup.passwordless}</p>
    </form>
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
