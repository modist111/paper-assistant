import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase the body size limit for PDF uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // Keep pdf-parse's bundled PDF.js loaded by Node rather than Next.js bundling.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
