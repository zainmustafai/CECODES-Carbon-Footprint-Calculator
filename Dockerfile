# CECODES - Huella de Carbono
#
# Two images from one file:
#   --target runner    the Next.js app. Slim: standalone bundle only, no Prisma CLI, non-root.
#   --target migrator  the one-shot init job. Keeps devDependencies, the Prisma CLI and bun,
#                      because prisma/seed.ts and prisma.config.ts are bun scripts.
#
# Both runtimes are here, and each is used for exactly what it can do:
#   bun   installs (the lockfile is bun.lock) and runs the seed scripts, because db:seed* and
#         prisma.config.ts's seed hook all shell out to `bun` by name.
#   node  builds and serves. `next build` loads Turbopack's native N-API module and a worker
#         pool, neither of which Bun implements, and output:"standalone" emits a Node server.js.
# Mixing them is safe here because every stage is Debian with the same glibc, so the native
# binaries bun resolves are the ones node loads.
#
# The version is pinned deliberately. `latest` would mean two builds a month apart produce
# different runtimes from identical source, which is the opposite of a portable deployment.
ARG BUN_VERSION=1.2.21

# ---------------------------------------------------------------------------------------------
# deps - install once, cached until the lockfile changes
# ---------------------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app

# prisma/ and prisma.config.ts are copied BEFORE install, not after. package.json has
# "postinstall": "prisma generate", which reads prisma/schema.prisma; with only the manifest
# copied (the usual cache-optimising trick) the install fails on a missing schema.
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma.config.ts imports this one file, and package.json's postinstall runs `prisma generate`
# during `bun install` below, so it has to exist here even though the rest of src/ does not yet.
# Copying only this file, not all of src/, keeps this stage's cache keyed on the lockfile and
# prisma/, not on every source edit - copying the whole of src/ here would defeat the reason this
# stage is separate from builder/migrator in the first place.
COPY src/lib/env-precedence.ts ./src/lib/env-precedence.ts
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------------------------
# builder - compile the app
# ---------------------------------------------------------------------------------------------
#
# NODE, not bun, and this is not a preference. `next build` loads Turbopack's native N-API module
# and spins up a worker pool, and under Bun that fails outright:
#   TypeError: symbol 'napi_register_module_v1' not found in native module
#   ERR_NOT_IMPLEMENTED at new WorkerPool
# Bun installs the dependencies, because the lockfile is bun.lock, and Node builds them. The two
# stages share a Debian base and the same glibc, so the native binaries bun resolved are the ones
# node loads here.
FROM node:22-slim AS builder
WORKDIR /app

# Nothing environment-specific is inlined into the bundle at build time any more. Every
# configuration value this app reads (DATABASE_URL, SITE_URL, mail settings) is read from
# process.env at runtime, not compiled in, so one image serves any deployment: build it once,
# run it against staging, production, or a laptop, with no rebuild in between.
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The generated Prisma client, brought over from deps rather than regenerated.
#
# It lands INSIDE src (prisma/schema.prisma sets output = "../src/lib/generated/prisma"), it is
# gitignored, and .dockerignore excludes it from the build context on purpose, so the COPY . .
# above cannot supply it. deps already produced it: package.json's postinstall runs
# prisma generate. Without this line the build fails at src/lib/prisma.ts on a module it cannot
# resolve. It comes AFTER COPY . . because that would otherwise overwrite the directory.
COPY --from=deps /app/src/lib/generated ./src/lib/generated

# Needs devDependencies: reactCompiler:true requires babel-plugin-react-compiler, and the build
# typechecks with typescript. Do not try to prune before this step.
#
# Note this step reaches the network: src/app/layout.tsx imports Geist/Inter from
# next/font/google, which fetches from Google's CDN during the build. On a host without outbound
# HTTPS this is the first thing that will fail.
# Invoked through node rather than the bin shim so it is unambiguous which runtime executes it.
RUN node node_modules/next/dist/bin/next build

# ---------------------------------------------------------------------------------------------
# migrator - the init job (target for the `init` compose service)
# ---------------------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS migrator
WORKDIR /app
ENV NODE_ENV=production

# The Prisma CLI shells out to a query engine that links against OpenSSL, and the bun image does
# not carry it. Without this, every migrate command prints "Prisma failed to detect the
# libssl/openssl version" and falls back to a guess, which is a warning today and a failure the
# day the guess is wrong.
RUN apt-get update && apt-get install -y --no-install-recommends openssl   && rm -rf /var/lib/apt/lists/*

# Deliberately the full install, not the pruned one: `prisma migrate deploy` needs the Prisma CLI,
# which is a devDependency. This image is short-lived and never serves traffic, so its size is not
# worth optimising - and keeping the CLI OUT of the runtime image is the actual security win.
# --chown, because this stage runs as the unprivileged bun user and the Prisma CLI writes into
# node_modules/@prisma/engines when it resolves an engine for the platform it finds. Copied as
# root it cannot, and migrate deploy fails with "please make sure you install prisma with the
# right permissions" rather than anything about permissions on the thing it actually wanted.
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock prisma.config.ts tsconfig.json ./
COPY --chown=bun:bun prisma ./prisma
COPY --chown=bun:bun scripts ./scripts
# The whole of src, not a hand-picked file or two. The prisma/*.ts scripts import across the app
# by relative path: seed.ts alone reaches src/lib/auth/password and the generated Prisma client,
# and the factor scripts reach further still. Copying only what today's seed happens to import is
# a trap that breaks the next time one of them grows an import, and the source is small next to
# node_modules.
COPY --chown=bun:bun src ./src

# The generated client, which .dockerignore keeps out of the build context, so the COPY above
# cannot supply it. Same reason as the builder stage.
COPY --from=deps --chown=bun:bun /app/src/lib/generated ./src/lib/generated

# The emission-factor workbook. init-db.ts does NOT import it - that stays a deliberate manual
# step, because it rewrites the shared factor library. But shipping it here means an operator can
# run `docker compose run --rm init bun prisma/import-factors.ts` without rebuilding, and the
# alternative is a system left on the 12 starter factors, which is not a usable carbon tool.
COPY --chown=bun:bun docs/reference ./docs/reference

USER bun
CMD ["bun", "scripts/init-db.ts"]

# ---------------------------------------------------------------------------------------------
# runner - the application
# ---------------------------------------------------------------------------------------------
#
# Node, not bun: `output: "standalone"` emits a Node server.js, and the oven/bun images do not
# ship a node binary at all. Debian slim rather than alpine because sharp (below) wants glibc.
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root. node:* images already provide an unprivileged `node` user (uid 1000).
RUN mkdir .next && chown node:node .next

# output:"standalone" produces a server bundle carrying only the modules actually imported, so no
# full node_modules copy here. static/ and public/ are NOT included in it and must be copied
# separately - a missing `static` is the classic "app runs but every stylesheet 404s" bug.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# The .hbs email templates, read with fs at runtime. next.config.ts also lists them in
# outputFileTracingIncludes, and this line is the belt to that braces: a template missing from the
# image is discovered by a user who cannot reset their password, which is too late to find out.
COPY --from=builder --chown=node:node /app/src/lib/mail/templates ./src/lib/mail/templates

# sharp, copied explicitly rather than left to dependency tracing. next/image is used in
# src/app/(auth)/layout.tsx and src/features/app-shell/components/app-sidebar.tsx, and Next's
# production image optimizer needs sharp; without it those two images fail to optimize at
# runtime. It is a transitive of next rather than a declared dependency here, so tracing it is
# not guaranteed. @img/* holds the prebuilt platform binaries sharp loads.
COPY --from=deps --chown=node:node /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps --chown=node:node /app/node_modules/@img ./node_modules/@img

USER node
EXPOSE 3000

CMD ["node", "server.js"]
