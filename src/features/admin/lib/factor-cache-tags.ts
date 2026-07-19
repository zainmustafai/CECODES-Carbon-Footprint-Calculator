// Cache tags for the shared, non-tenant factor-library reads. Kept in their own module (no
// server-only) so a Server Action can import just the tag names to invalidate them, without
// pulling in the unstable_cache machinery (and its server-only guard) that factor-library-cache
// carries. See factor-library-cache.ts for why these surfaces are safe to cache.
export const FACTOR_LIBRARY_TAG = "factor-library";
export const GRID_FACTORS_TAG = "grid-factors";
