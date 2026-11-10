"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALES, stripLocale, localizePath, type Locale } from "@/lib/i18n/locales";

const LABEL: Record<Locale, string> = { en: "English", es: "Español" };
const SHORT: Record<Locale, string> = { en: "EN", es: "ES" };

/** EN/ES links to `path` in each language; remembers the choice in a cookie. */
export function LanguageLinks({ locale, label, path }: { locale: Locale; label: string; path: string }) {
  return (
    <nav aria-label={label} className="flex items-center gap-2 text-xs font-bold" data-testid="language-switcher">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={localizePath(l, path)}
          hrefLang={l}
          lang={l}
          aria-current={l === locale ? "true" : undefined}
          title={LABEL[l]}
          onClick={() => {
            document.cookie = `lf_locale=${l}; path=/; max-age=31536000; samesite=lax`;
          }}
          className={`tap-target justify-center rounded-md border border-line ${l === locale ? "bg-forest text-white underline underline-offset-2" : "text-ink hover:bg-mint"}`}
        >
          {SHORT[l]}
        </Link>
      ))}
    </nav>
  );
}

/** Same page in the other language (needs the current path, so it streams in behind Suspense). */
export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const { path } = stripLocale(usePathname() || `/${locale}`);
  return <LanguageLinks locale={locale} label={label} path={path} />;
}
