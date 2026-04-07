import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apify-client dynamically imports `proxy-agent`; bundling would omit it and break at runtime.
  serverExternalPackages: ["apify-client", "proxy-agent"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "fimgs.net", pathname: "/**" },
      { protocol: "https", hostname: "www.fragrantica.com", pathname: "/**" },
      { protocol: "https", hostname: "fragrantica.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
