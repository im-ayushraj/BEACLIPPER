import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "10.130.108.165",
    "localhost",
    "127.0.0.1",
  ],
  experimental: {
    proxyClientMaxBodySize: "50gb",
  } as any,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/output/:path*",
        destination: `${BACKEND_URL}/output/:path*`,
      },
    ];
  },
};

export default nextConfig;
