import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  // NOTE ON CACHING (deliberate): cacheComponents (PPR / `use cache`) is NOT enabled. It is a
  // whole-app switch: with it on, every uncached dynamic read must sit under a Suspense boundary
  // or the route fails to prerender. This app reads auth cookies directly in its layouts (the
  // (app) shell, the (auth) redirect gate, the root locale), so enabling it would force a risky
  // restructure of the auth/shell architecture on every page just to cache one surface. The
  // shared, non-tenant factor library is cached instead with unstable_cache + tag invalidation
  // (src/features/admin/lib/factor-library-cache.ts), which needs no shell changes and keeps
  // every tenant read dynamic. See that file for why it is safe.
  // Pin the workspace root to this project (a stray bun.lock in the home dir confuses Turbopack).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default withNextIntl(nextConfig);
