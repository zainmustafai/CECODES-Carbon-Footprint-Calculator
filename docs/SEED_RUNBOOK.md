# Production seed runbook

How to load and re-load the reference data (the emission-factor library, its versions, the grid
factors, the travel correction, and the single admin) on the shared Supabase database, safely and
idempotently.

## What the prod seed touches, and what it never touches

Writes ONLY to four tables: `emission_factors`, `emission_factor_versions`,
`grid_electricity_factors`, and the one admin row in `app_users`. It **never** writes a company,
sede, user, or activity row; it **never** seeds demo or E2E data; it **never** seeds the placeholder
"starter" factors; it **never** resets or truncates. It is safe to run against the shared database
while real, demo, and E2E data coexist.

## Idempotent by construction

Run it once or a hundred times and the end state is the same:
- The factor import matches every row by its natural key and updates or inserts, and it **never
  overwrites a human edit** (those show as `keptAdminEdited`).
- Grid factors are create-only, so an admin's corrected value survives a re-run. Conflicting or
  missing grid years are **reported, not overwritten** (`grid: N ok, M mismatch, K missing`).
- The travel correction skips any factor already corrected, so it corrects exactly once.
- The single convergence a fresh-ish DB may show is the removal of leftover starter placeholder
  factors (`starterDeleted` / `starterDeactivated`); once gone, that too is a no-op.

## The commands

```bash
# 1. Take a Supabase point-in-time snapshot first. Cheap insurance on a shared database.

# 2. Apply migrations (never migrate dev / reset here).
bun run db:deploy

# 3. DRY RUN. Writes nothing. Read the summary; confirm it is a no-op (or only a starter cleanup).
bun run db:seed:prod

# 4. APPLY. Idempotent.
bun run db:seed:prod --apply

# 5. Prove it. Run apply AGAIN; the summary should show created:0 updated:0 and 0 travel corrections.
bun run db:seed:prod --apply
```

The seed orchestrates the existing, tested scripts (`import-factors`, `seed`, `fix-travel-factors`)
in the order that keeps them idempotent: the import runs BEFORE `seed`, so `seed`'s starter subset
(guarded on an empty library) never fires. Each sub-script owns its own database connection and its
own dry-run support.

## What still needs a human (client-blocked, by design)

The seed loads today's best-known library at the documented defaults; the pending client answers do
NOT block it, they land later through the admin UI, with the audit trail:
- The disputed and missing grid-electricity years (`mismatch` / `missing` in the summary) are
  resolved one by one in the admin grid tab, not by editing this seed.
- The CH4 fuel rule, the authoritative grid sheet, and the spend-factor units are switch-point
  changes in code (see docs/COMPLETION_PLAN_V2.md), not seed data.

## The admin credential

The admin is upserted from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the environment. For production use a
strong, rotated password, never the dev one, and set it in the deployment environment, never in a
committed file.
