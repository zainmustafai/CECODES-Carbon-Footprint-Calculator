// Client-safe surface of the auth feature. The main barrel (./index.ts) exports server
// screens that import next-intl/server, so client components import hooks from here to
// keep server-only modules out of the client graph.
export { useLogout } from "./hooks/use-logout";
