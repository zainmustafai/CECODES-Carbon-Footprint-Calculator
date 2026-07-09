import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pin the workspace root to this project (a stray bun.lock in the home dir confuses Turbopack).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
