# CECODES - Huella de Carbono
#
# Two images from one file:
#   --target runner    the Next.js app. Slim: standalone bundle only, no Prisma CLI, non-root.
#   --target migrator  the one-shot init job. Keeps devDependencies, the Prisma CLI and bun,
#                      because prisma/seed.ts and prisma.config.ts are bun scripts.
#
# Bun, not Node, because package.json's db:seed* scripts and prisma.config.ts's seed hook all
# shell out to `bun`. The app itself runs under Node inside the standalone bundle.
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
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------------------------
# builder - compile the app
# ---------------------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS builder
WORKDIR /app

# Next inlines NEXT_PUBLIC_* into the bundle at BUILD time, so these must be present now, not at
# run time. The practical consequence: an image is tied to one Supabase project. Build on the
# target host (docker compose up -d --build) and compose passes them from .env automatically.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Needs devDependencies: reactCompiler:true requires babel-plugin-react-compiler, and the build
# typechecks with typescript. Do not try to prune before this step.
#
# Note this step reaches the network: src/app/layout.tsx imports Geist/Inter from
# next/font/google, which fetches from Google's CDN during the build. On a host without outbound
# HTTPS this is the first thing that will fail.
RUN bun run build

# ---------------------------------------------------------------------------------------------
# migrator - the init job (target for the `init` compose service)
# ---------------------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS migrator
WORKDIR /app
ENV NODE_ENV=production

# Deliberately the full install, not the pruned one: `prisma migrate deploy` needs the Prisma CLI,
# which is a devDependency. This image is short-lived and never serves traffic, so its size is not
# worth optimising - and keeping the CLI OUT of the runtime image is the actual security win.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src/lib/env.ts ./src/lib/env.ts

# The emission-factor workbook. init-db.ts does NOT import it - that stays a deliberate manual
# step, because it rewrites the shared factor library. But shipping it here means an operator can
# run `docker compose run --rm init bun prisma/import-factors.ts` without rebuilding, and the
# alternative is a system left on the 12 starter factors, which is not a usable carbon tool.
COPY docs/reference ./docs/reference

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
