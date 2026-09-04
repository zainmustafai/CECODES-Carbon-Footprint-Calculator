# Auth use-case register

This file is the source of truth for "100% of the auth use cases are covered." It is not
prose that a reader takes on faith: `src/lib/auth/__tests__/use-case-coverage.test.ts` parses
this file for ids matching `AUTH-\d{2}`, then scans every `*.test.ts` under `src/` and every
`*.spec.ts` under `e2e/` for the same ids. A case is covered only when some **running** test's
own name contains its id, next to the assertion that id describes.

"Running" is checked, not assumed. A title wearing `.skip`, `.todo`, `.only`, `.skipIf`,
`.runIf` or `.failing`, or sitting inside a `describe` wearing one of those, is not coverage,
and an id parked on such a title is itself a build failure. Otherwise "covered" would mean
"mentioned somewhere", which is the one thing this register exists to stop.

That means three failure modes are build failures, not just one:

- Add a row here without a test that names its id, and the gate fails listing the id as
  registered but uncovered.
- Rename or delete a row's id after a test already claims it, and the gate fails the other
  direction, listing the id as named by a test but no longer in the register. This is what
  catches a case that was renamed in one place and not the other, leaving a test that
  advertises coverage of something that no longer describes anything.
- Park an id on a test that cannot run, and the gate names the file, the title and the
  modifier responsible.

So: adding a line to this file without a test breaks the build, on purpose. That is what turns
"we cover every auth use case" from a claim into something a CI run can refute.

Each row states one behaviour. A test proves the id was considered and exercised; it does not
by itself prove the assertion is strong, that is what code review is for. The wording below
describes this codebase as it stands today (self-hosted sessions over `user_sessions`, bcrypt
in `app_users`, no Supabase Auth anywhere), not the Supabase-era tool it replaced. Where the
original design list drifted from what the code now does, the wording here was corrected
against the code, not against the old design; see the Task 10 report for which rows changed
and why.

## Sign in

- AUTH-01 correct credentials on an active user create a session, set the cookie, and land on `POST_LOGIN_PATH`
- AUTH-02 a wrong password returns an opaque key and creates no session
- AUTH-03 an unknown email returns the identical opaque key
- AUTH-04 an unknown email still costs one bcrypt comparison against a dummy hash at the policy cost
- AUTH-05 a correct password on a deactivated user is refused and is not counted by the throttle
- AUTH-06 a user row with a NULL passwordHash is refused without crashing
- AUTH-07 a malformed or truncated stored hash returns false rather than throwing
- AUTH-08 a hash below the policy cost is rehashed on successful sign-in
- AUTH-09 the session token rotates on every sign-in
- AUTH-10 email is normalized identically on lookup and on storage
- AUTH-11 sign-in input is rejected by a strict Zod schema (unknown key, oversized email)
- AUTH-12 no maximum length is applied on sign-in, so a pre-existing long password still works

## Throttle

- AUTH-13 consecutive failures lock the per-email key
- AUTH-14 the per-IP key locks independently of the per-email key
- AUTH-15 a successful sign-in clears the per-email key
- AUTH-16 the throttle is checked before the password is verified
- AUTH-17 password reset uses its own key and cannot lock sign-in

## Sessions

- AUTH-18 only the SHA-256 of a token is stored; the raw token never reaches the database
- AUTH-19 the cookie is httpOnly, sameSite=lax, path=/, and secure everywhere except development
- AUTH-20 an expired session reads as signed out
- AUTH-21 expired rows are deleted opportunistically
- AUTH-22 a forged or unknown cookie value resolves to null without crashing
- AUTH-23 an absent cookie resolves to null
- AUTH-24 lastUsedAt is refreshed on use
- AUTH-25 sign out deletes the row and clears the cookie
- AUTH-26 sign out with no session does not throw

## Authorization and immediacy

- AUTH-27 deactivating a user takes effect on their next request
- AUTH-28 deactivating a user deletes their sessions
- AUTH-29 the schema declares ON DELETE CASCADE on the session and reset-token relations
- AUTH-30 requireAdmin() returns 404 for a company user
- AUTH-31 a company user calling an admin Server Action is refused by company-scope.ts

## Password reset

- AUTH-32 a request for a real address writes exactly one token row and sends exactly one message
- AUTH-33 a request for an unknown address returns void, writes no row, and sends nothing
- AUTH-34 a request with mail unconfigured is refused up front and writes no row
- AUTH-55 a request with no public site origin configured is refused up front, and writes no row
- AUTH-35 the link origin follows the fallback order SITE_URL, then DOMAIN (the compose default of localhost not counting as one), then VERCEL_URL, then the request's Host in development only; outside development an unconfigured origin is empty rather than Host-derived, and a value that is not an absolute http(s) origin is refused
- AUTH-36 consuming a valid token sets the new hash, marks the token consumed, revokes all sessions, and invalidates that user's other outstanding tokens, in one transaction
- AUTH-37 a consumed token cannot be reused
- AUTH-38 an expired token is refused
- AUTH-39 an unknown token is refused
- AUTH-40 every reset failure returns the identical opaque result

## Password change while signed in

- AUTH-41 the current password is required
- AUTH-42 a successful change revokes other sessions and outstanding reset tokens
- AUTH-43 PASSWORD_MAX is enforced on the new password
- AUTH-44 a password-changed message is sent
- AUTH-56 the re-authentication that gates the change is metered on the same sign-in throttle key /login uses, refused ahead of the bcrypt compare and cleared on success, so a stolen session can neither brute-force the current password nor burn CPU trying
- AUTH-57 a deactivated account is refused the change even holding a live session and the right current password, and nothing downstream of the refusal runs

## Admin user management

- AUTH-45 createUser writes credential and profile as columns of one row in a single insert, never as two writes with a window between them
- AUTH-46 createUser on a duplicate email returns the opaque key emailInUse, from Prisma's P2002 and from the raw Postgres 23505 alike, and the one insert that failed leaves no orphan row behind
- AUTH-47 the classifier that opaque key is derived from tells a unique violation on email, in Prisma's shape and Postgres's alike, from one on any other column
- AUTH-48 createUser sends the welcome message containing a set-password link and no password
- AUTH-49 resetUserPassword replaces the hash, revokes that user's sessions, and sends the password-changed message with byAdmin: true
- AUTH-50 deleteUser removes the row in one statement and refuses when the affected count is not one; the dependents go with it by the cascade AUTH-29 asserts, not by a second statement here
- AUTH-51 every admin action re-validates with a .strict() Zod schema

## Route gate

- AUTH-52 an unauthenticated request to a protected route redirects to /login and keeps no part of the original URL, not even as ?next=
- AUTH-53 an authenticated request to /login redirects to POST_LOGIN_PATH
- AUTH-54 the proxy matcher keeps /api/health/* from ever reaching the gate, and any cookie written before a redirect is carried onto the redirect response
