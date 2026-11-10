import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import { getDictionary } from "@/content/dictionaries";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LOCALES } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { siteUrl } from "@/lib/seo";
import "../globals.css";

const newsreader = Newsreader({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-newsreader", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await currentLocale());
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t.meta.title, template: `%s · ${t.meta.siteName}` },
    description: t.meta.description,
    applicationName: t.meta.siteName,
    openGraph: { siteName: t.meta.siteName, type: "website" },
    robots: process.env.SITE_ENV === "production" ? undefined : { index: false, follow: false },
  };
}

export const viewport: Viewport = { themeColor: "#164b3b", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await currentLocale();
  return (
    <html lang={locale} className={`${newsreader.variable} ${plex.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          {locale === "es" ? "Saltar al contenido" : "Skip to content"}
        </a>
        <SiteHeader locale={locale} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter locale={locale} />
      </body>
    </html>
  );
}
