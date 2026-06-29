import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // Allow pdf-parse to work in Node.js runtime
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
