import Link from "next/link";
import { getDictionary } from "@/content/dictionaries";
import { Disclaimer } from "@/components/disclaimer";
import type { Locale } from "@/lib/i18n/locales";

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <footer className="no-print border-t border-line bg-cream">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <Link href={`/${locale}/sample`} className="tap-target hover:underline">{t.nav.sample}</Link>
          <Link href={`/${locale}/blog`} className="tap-target hover:underline">{t.nav.blog}</Link>
          <Link href={`/${locale}/audits/new`} className="tap-target hover:underline">{t.nav.startScan}</Link>
        </nav>
        <Disclaimer locale={locale} />
        <p className="text-xs text-muted">{t.footer.tagline}</p>
      </div>
    </footer>
  );
}
