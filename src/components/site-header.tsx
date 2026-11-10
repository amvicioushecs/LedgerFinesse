import Link from "next/link";
import { Suspense } from "react";
import { getDictionary } from "@/content/dictionaries";
import { LanguageLinks, LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import type { Locale } from "@/lib/i18n/locales";
import { getCurrentUser } from "@/lib/server/runtime";

async function AccountLinks({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href={`/${locale}/signin`} className="tap-target hidden text-sm font-semibold text-ink underline-offset-4 hover:underline sm:inline-flex">
        {t.nav.signIn}
      </Link>
    );
  }
  return (
    <>
      <Link href={`/${locale}/audits`} className="tap-target text-sm font-semibold text-ink underline-offset-4 hover:underline">
        {t.nav.myAudits}
      </Link>
      <form action="/auth/signout" method="post" className="hidden sm:block">
        <input type="hidden" name="locale" value={locale} />
        <button className="tap-target text-sm text-muted underline-offset-4 hover:underline">{t.nav.signOut}</button>
      </form>
    </>
  );
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div aria-hidden className="h-[3px] bg-[linear-gradient(90deg,var(--color-gold)_0%,var(--color-gold)_25%,var(--color-forest-deep)_25%)]" />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo href={`/${locale}`} />
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href={`/${locale}/blog`} className="tap-target hidden text-sm font-semibold text-ink underline-offset-4 hover:underline md:inline-flex">
            {t.nav.blog}
          </Link>
          <Suspense fallback={null}>
            <AccountLinks locale={locale} />
          </Suspense>
          <Suspense fallback={<LanguageLinks locale={locale} label={t.nav.language} path="/" />}>
            <LanguageSwitcher locale={locale} label={t.nav.language} />
          </Suspense>
          <Link href={`/${locale}/audits/new`} className="btn btn-forest hidden px-4 py-2 text-sm sm:inline-flex">
            {t.nav.startScan}
          </Link>
        </div>
      </div>
    </header>
  );
}
