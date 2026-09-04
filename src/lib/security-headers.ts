// Response headers applied to every route by next.config.ts. They live here, not inline in the
// config, so a test can assert them: next.config.ts is otherwise untested, and these are exactly
// the kind of lines that get dropped during an unrelated config edit and are never missed.
//
// The concrete risk this closes is clickjacking against the admin console. An attacker who frames
// /admin/companies/[id] can overlay their own page on it and trick a signed-in CECODES admin into
// clicking through a deactivation or a password reset. Nothing in the app can detect that; only a
// framing refusal from the browser stops it.
//
// There is deliberately NO script-src, style-src or default-src here. A full Content Security
// Policy under Next 16 needs a nonce threaded through src/proxy.ts and every inline script, and
// Recharts and react-pdf both emit inline styles. That is a separate change with a real chance of
// breaking pages only in production. `frame-ancestors` is the one directive that carries its own
// weight alone, and X-Frame-Options repeats it for browsers that honour only the older header.

type SecurityHeader = { key: string; value: string };

export function securityHeaders(): SecurityHeader[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    // Two years, subdomains included. Vercel terminates TLS for every deployment, so there is no
    // plain-HTTP surface this can lock a user out of.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Full URLs of an authenticated app leak the tenant id in the path (/admin/companies/<id>),
    // so cross-origin requests get the origin only.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The app asks for none of these. Denying them means an injected third-party script cannot
    // ask on our behalf either.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];
}
