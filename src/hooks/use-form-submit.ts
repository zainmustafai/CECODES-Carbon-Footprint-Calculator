"use client";

import { useSyncExternalStore, useTransition } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";

// A store that never changes, so useHydrated below re-renders exactly once, when React swaps the
// server snapshot for the client one. Defined at module scope because useSyncExternalStore
// resubscribes whenever the subscribe function changes identity.
const subscribeToNothing = () => () => {};

// False on the server and through hydration, true from the moment the component is live on the
// client. Gate the submit button of every onSubmit form on it: `disabled={!hydrated}`.
//
// The bug it exists for. Every form here submits through onSubmit and declares no action, so the
// markup the server sends is a plain <form> with no handler attached yet. Before hydration a
// submit is therefore a NATIVE submit, and it was reaching production: the login form put
// ?email=...&password=... in the address bar, which is browser history and the CDN access log.
// method="post" (now on every form) moves the fields into the request body, which closes the
// leak, but it does NOT make the stray submit visible, and an earlier version of this comment
// said it did. The claim was that a POST to a page route with no POST handler comes back as a
// 405 in the user's face. Checked against the installed Next (16.2.10) rather than from memory,
// that is false. A native form POST sends content-type application/x-www-form-urlencoded, and
// server/lib/server-action-request-meta.js counts any urlencoded POST as a possible Server
// Action, which is exactly the condition that skips the 405 branch in server/base-server.js
// ("Server actions can use non-GET/HEAD methods"). server/app-render/action-handler.js then
// bails on it, because urlencoded actions are not supported, and for a non-fetch request it
// bails by returning null, which means "not handled, carry on rendering". Next's own source
// says why in a comment there: "to prevent changes in behavior when a regular page component
// tries to handle a POST". The user gets HTTP 200 and the page again, their input silently
// dropped, with nothing on screen to say the submit went nowhere.
//
// So the disabled button is not a nicety layered on top of a loud failure. It is the only thing
// that stops the submit from happening at all. Per the HTML spec, implicit submission does
// nothing when the form's default button is disabled, so disabling that one button closes the
// click path and the Enter-in-a-field path together, and it is the only thing that works with no
// JavaScript running yet.
//
// Why it is a hook of its own rather than another field on useFormSubmit's return, which is where
// it belongs by rights: no form component calls useFormSubmit. Each calls its feature hook
// (useLogin, useUserForm, ...) which returns a fixed { form, onSubmit, isSubmitting, serverError }
// shape, so a new field here would stop at seventeen intermediate hooks and never reach a button.
// The decision still lives in one place, which is the point; only the wiring is per component, and
// src/__tests__/conventions.test.ts holds every form to it.
//
// Why this creates no hydration mismatch: React uses getServerSnapshot both when rendering on the
// server and while hydrating, so the client's first render produces the same disabled button the
// server did. Only after hydration commits does React read the client snapshot and re-render with
// the button enabled. A component that mounts later (every dialog form here) never hydrates at
// all, so it reads the client snapshot on its first render and its button is enabled immediately,
// with no disabled frame to see.
//
// Why not useState plus useEffect, the usual mounted flag: it cannot tell hydration from a normal
// mount, so every dialog would paint one frame with a dead submit button each time it opened.
// Both shapes survive the React Compiler for the same reason useTransition does below: the value
// is real React state that the compiler cannot cache stale, not a read through a proxy.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

// The reliable pending state for a form with a visible submit button (feedback shape 1 in
// IMPLEMENTATION.md section 4). Use this instead of `form.formState.isSubmitting`.
//
// Why not `form.formState.isSubmitting` directly: React Compiler is on (next.config.ts), and
// RHF drives `formState` through a Proxy whose getter has to run on every render to keep the
// subscription alive. When a hook reads `form.formState.isSubmitting` once and returns the
// value, the compiler memoizes the hook's result and stops re-running that proxy read, so the
// button never disables or shows its spinner. This was verified in a browser: a multi-second
// sign-in left the "Ingresar" button enabled with no spinner the whole time. The onboarding
// wizard already documents the same effect ("the React Compiler treats [the callback] as
// render-time") and works around one symptom of it with a ref guard.
//
// useTransition owns the pending flag with real React state, which the compiler cannot stale
// cache, so it is the same mechanism the rest of the app already trusts for pending UI
// (use-toast-action, the language toggle, the list filters). It has a second benefit the raw
// flag never had: an async transition stays pending until the work it schedules commits, so
// when the submit handler ends in router.push/router.refresh the button keeps its spinner
// until the destination renders, rather than going idle the instant the action returns while
// the next screen is still loading.
export function useFormSubmit<T extends FieldValues>(
  form: UseFormReturn<T>,
  handler: SubmitHandler<T>,
): {
  onSubmit: (event?: React.BaseSyntheticEvent) => void;
  isSubmitting: boolean;
} {
  const [isSubmitting, startTransition] = useTransition();

  // handleSubmit runs validation and preventDefault synchronously, then calls our callback
  // only when the values are valid. The callback opens the transition; the async work runs
  // inside it, so isSubmitting stays true for the whole action and any navigation it triggers.
  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      await handler(values);
    });
  });

  return { onSubmit, isSubmitting };
}
