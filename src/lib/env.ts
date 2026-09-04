import { z } from "zod";

/**
 * The environment contract, in one place.
 *
 * Before this existed, a missing variable surfaced in one of three ways, none of them good:
 * a 500 on the first database query (DATABASE_URL), a crash inside supabase-js
 * (NEXT_PUBLIC_SUPABASE_URL, which src/lib/supabase/server.ts asserts with `!`), or - worst -
 * an app that booted and served protected routes with the auth gate silently switched off
 * (src/lib/supabase/middleware.ts used to return early when the Supabase env was absent).
 *
 * On Vercel that was survivable: the variables are set once in a dashboard and rarely move. In a
 * container they come from a .env file that a human edits per server, so a typo is routine and
 * has to be caught at boot rather than at first request.
 *
 * Deliberately NOT validated as a URL: DATABASE_URL. Prisma and pg accept forms zod's url()
 * rejects, and a false rejection at boot would be worse than the late failure it replaces.
 */

/** Variables the app cannot serve a single authenticated request without. */
const runtimeSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_URL is required")
    .refine((v) => !v.includes("<project-ref>"), {
      message: "NEXT_PUBLIC_SUPABASE_URL still holds the .env.example placeholder",
    }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

/** Additionally required by the init job: migrations, and creating the first admin. */
const initSchema = runtimeSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required to create the admin account"),
  ADMIN_EMAIL: z.email("ADMIN_EMAIL must be an email address"),
  ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters"),
});

export type RuntimeEnv = z.infer<typeof runtimeSchema>;

/**
 * Reports the NAMES of variables that failed validation, never their values. These messages reach
 * container logs, which are routinely pasted into chat windows and issue trackers.
 */
function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.message}`).join("\n");
}

export function validateRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const parsed = runtimeSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment. The application cannot start:\n${formatIssues(parsed.error)}\n\n` +
        `See .env.example for the full list.`,
    );
  }
  return parsed.data;
}

export function validateInitEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = initSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment. Database initialization cannot run:\n${formatIssues(parsed.error)}\n\n` +
        `See .env.example for the full list.`,
    );
  }
  return parsed.data;
}

/** Variable names the init job reports as present, so a log shows what was configured. */
export const INIT_ENV_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
] as const;
