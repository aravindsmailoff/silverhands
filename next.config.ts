import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/videos/:path*",
        destination: "http://localhost:8000/videos/:path*",
      },
    ];
  },
};

export default nextConfig;
