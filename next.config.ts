import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  headers() {
    return [{
      source: "/:path*.md",
      headers: [{ key: "Content-Type", value: "text/markdown; charset=utf-8" }],
    }];
  },
};

export default nextConfig;
