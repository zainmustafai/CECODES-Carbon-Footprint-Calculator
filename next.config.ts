import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pin the workspace root to this project (a stray bun.lock in the home dir confuses Turbopack).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default withNextIntl(nextConfig);
