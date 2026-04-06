import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apify-client dynamically imports `proxy-agent`; bundling would omit it and break at runtime.
  serverExternalPackages: ["apify-client", "proxy-agent"],
};

export default nextConfig;
