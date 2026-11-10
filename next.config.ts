import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents/partialPrefetching stay OFF: with @opennextjs/cloudflare 1.20.13 any page rendered at
  // request time hangs workerd ("Worker's code had hung") when a proxy.ts is present. Fixed upstream only in
  // the unmerged opennextjs/opennextjs-cloudflare#1318. Reads are already Suspense-wrapped, so re-enabling
  // is a two-line change once that ships; re-run `npm run test:e2e:cf` before doing it.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
