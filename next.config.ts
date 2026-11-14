import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is static and audits run in the browser, so Spacefast serves the
  // export directly with no Workers runtime.
  output: "export",
};

export default nextConfig;
