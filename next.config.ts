import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase the body size limit for PDF uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // Mark pdf-parse as external (it has native deps that don't bundle well on Windows)
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
