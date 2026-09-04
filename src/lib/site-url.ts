// The origin that goes into emailed links (password reset, address confirmation).
//
// This used to read the request's Host header, which is host-header injection: an attacker sends
// a reset request for someone else's account with Host set to a site they own, Supabase mails the
// real user a real token, and the link points at the attacker. The only thing standing in the way
// was Supabase's redirect-URL allow-list, which is a setting in an external console, not code, and
// nothing in this repository tests it or even mentions it.
//
// So the origin is pinned to configuration instead, in this order:
//
//   SITE_URL     an explicit override, for a deployment whose public address is not its DOMAIN
//                (behind a path-based proxy, or a second hostname).
//   DOMAIN       already set by any Compose deployment running the edge profile, because Caddy
//                needs it to get a certificate. Reusing it means the common case configures
//                nothing new. The compose default of "localhost" is ignored: it is a fallback,
//                not a statement about the public address.
//   VERCEL_URL   platform-set per deployment, for the Vercel path. No request can influence it.
//   the Host     development only, where the port varies and a mailed link reaches no stranger.
//
// Everywhere else an unset origin yields "", which makes the redirect fail visibly rather than
// silently point somewhere unintended.
//
// Deliberately NOT a NEXT_PUBLIC_ variable. Next inlines those at BUILD time, so one image would
// be welded to one hostname and a second deployment could not change it without a rebuild. Only
// server code needs this value, so a plain runtime variable is both safer and more flexible.

type OriginEnv = {
  siteUrl?: string | null;
  domain?: string | null;
  vercelUrl?: string | null;
  nodeEnv?: string | null;
};

type RequestOrigin = {
  host?: string | null;
  forwardedProto?: string | null;
};

/** Absolute http(s) origin, no trailing slash. "" when nothing trustworthy is configured. */
export function resolveSiteOrigin(env: OriginEnv, request: RequestOrigin): string {
  const configured = normalize(env.siteUrl);
  if (configured) return configured;

  // Both are hostnames, not URLs, and both are served over TLS in every deployment that has one.
  const domain = env.domain?.trim();
  if (domain && domain !== "localhost") return hostnameOrigin(domain);

  const deployment = env.vercelUrl?.trim();
  if (deployment) return hostnameOrigin(deployment);

  if (env.nodeEnv === "development" && request.host) {
    return normalize(`${request.forwardedProto ?? "http"}://${request.host}`);
  }

  return "";
}

function hostnameOrigin(hostname: string): string {
  return normalize(`https://${hostname.replace(/^https?:\/\//, "")}`);
}

function normalize(value: string | null | undefined): string {
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return ""; // not absolute, so not usable as an origin
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  return url.origin;
}
