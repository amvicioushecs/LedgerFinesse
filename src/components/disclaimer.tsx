import { getDictionary } from "@/content/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

/** Not-a-law-firm notice. Required on the landing page, results, paywall and letters. */
export function Disclaimer({ locale, className = "" }: { locale: Locale; className?: string }) {
  return (
    <p role="note" data-testid="disclaimer" className={`text-xs leading-relaxed text-muted ${className}`}>
      {getDictionary(locale).disclaimer}
    </p>
  );
}
