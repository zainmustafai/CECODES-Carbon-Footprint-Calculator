// Prevents open-redirects: only allow same-origin, path-absolute targets.
// Rejects protocol-relative ("//host") and backslash-tricked ("/\\host") values.
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
