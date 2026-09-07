import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  // `next dev` rewrites the top of AGENTS.md (and CLAUDE.md) on every run with its own managed
  // block. Next 16.3's wording contains an em dash, which this project bans and
  // src/__tests__/conventions.test.ts enforces, so a single dev run turned the suite red. The
  // guidance itself is worth keeping, so it stays at the top of AGENTS.md, hand-written and
  // punctuated like the rest of the repo. Off means Next never touches either file again.
  agentRules: false,
  // Emits .next/standalone: a self-contained server bundle with only the modules actually
  // imported. A container needs it, because without it the runtime image has to carry the whole
  // node_modules tree (shadcn alone drags in ts-morph and @babel/core). The Dockerfile's runner
  // stage copies .next/standalone directly, so this is what makes that image small.
  //
  // NOT on Vercel, and the comment here used to say it was "harmless on Vercel, which ignores
  // it". That was wrong and it cost a day of failed deployments (2026-09-07):
  //
  //   Running onBuildComplete from Vercel
  //   Error: ENOENT: no such file or directory, open
  //     '/vercel/path0/.next/next-server.js.nft.json'
  //
  // Vercel does its own file tracing and reads that manifest after the build. Standalone mode
  // copies the traced files into .next/standalone instead, so Vercel's step looks for a manifest
  // that is no longer where it expects. The build itself succeeds, which is what makes this
  // confusing: the failure is in Vercel's post-build hook, after "Compiled successfully".
  //
  // Setting it per platform rather than removing it keeps both deployment targets working from
  // one config. VERCEL is set to "1" on every Vercel build, and is unset in Docker and locally.
  output: process.env.VERCEL ? undefined : "standalone",
  // The .hbs files under src/lib/mail/templates are read with fs at runtime, so Next's import
  // tracing cannot see them and would ship none of them. Without this the standalone server throws
  // "Email template not found" the first time anyone asks for a password reset. The Dockerfile also
  // COPYs the directory, deliberately: a missing template is discovered by a locked-out user.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/mail/templates/**"],
  },
  // handlebars compiles templates with new Function, which a bundler cannot follow. nodemailer
  // does its own dynamic requires for transport implementations it may never use. Both are
  // things a bundler cannot follow, so both stay a plain node_modules require at runtime.
  serverExternalPackages: ["handlebars", "nodemailer"],
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
  // Clickjacking, protocol downgrade and MIME sniffing defences, applied to every route.
  // The list itself is in src/lib/security-headers.ts so it can be tested; see the comment
  // there for why there is no script-src.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default withNextIntl(nextConfig);
