import { z } from "zod";

// The server's own copy of the auth rules. IMPLEMENTATION.md §8: "the server re-validates with
// its own schema and never trusts the client's". Every tenant action already did this; the auth
// actions did not, which meant the documented password policy lived only in the browser and a
// direct POST to updatePasswordAction fell through to Supabase's own 6-character floor.
//
// These schemas carry no messages. Auth errors return opaque i18n keys (never sentences, never
// field-level detail), so there is nothing here for a translator to phrase: a rejection is always
// just "invalidInput". That also keeps them free of the translator argument the client factories
// in auth-schemas.ts need, which is why they are separate objects rather than a shared base.
//
// Every object is .strict(): an unexpected key is a rejection, not a silently dropped field, so
// no hand-crafted request can smuggle an extra property through to a Supabase call.

/** The one place the password policy is written down. Both sides of the boundary import it. */
export const PASSWORD_MIN = 8;

const email = z.string().trim().min(1).email();
const password = z.string().min(PASSWORD_MIN);

export const signInInput = z
  .object({
    email,
    // Not PASSWORD_MIN: an existing account may predate the policy, and rejecting a short
    // password here would leak that the stored one is short. Length is enforced where a password
    // is SET, not where it is checked.
    password: z.string().min(1),
  })
  .strict();

export const signUpInput = z.object({ email, password }).strict();

export const emailInput = email;

export const passwordInput = password;
