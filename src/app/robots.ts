import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/** Production: index public pages, keep account/checkout/API out. Elsewhere: block everything. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  if (process.env.SITE_ENV !== "production") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/en/audits", "/es/audits", "/en/signin", "/es/signin", "/en/reset-password", "/es/reset-password", "/en/checkout", "/es/checkout"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
