import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHydrated } from "../use-form-submit";

// useHydrated gates the submit button of every form in this app (`disabled={!hydrated}`), so its
// two halves fail in opposite directions and both failures are severe.
//
// Stuck false, and every submit button in the application is permanently dead: nobody signs in,
// nobody saves an entry, nothing works, on every screen at once, with every static check in the
// repo still green.
//
// True on the server, and the pre-hydration native submit is back, which is the credential leak
// the gate exists for (the story is in src/__tests__/conventions.test.ts).
//
// The server half is a plain render assertion. The client half is not, and here is why. Vitest
// runs in a node environment (vitest.config.ts) and this project installs no DOM and no renderer
// that could mount a component outside one: no jsdom, no happy-dom, no @testing-library/react,
// no react-test-renderer. Nothing in this suite can hydrate or client-render a component, so
// React cannot be made to perform the real snapshot swap here. That is stated plainly rather
// than papered over: the tests below do NOT prove React's hydration behaviour.
//
// What they do prove is everything on our side of that boundary, which is where the failure
// modes above actually live. The mock intercepts the exact useSyncExternalStore call the hook
// makes and checks the three arguments it passes: that the client snapshot returns true, that it
// is passed in the client position rather than the server one (swapping the two is the whole
// catastrophe, and both orders type-check), and that the subscribe function is a stable no-op.
// It then renders the real component through the snapshot React reads once it is live on the
// client, and asserts the button comes out enabled.
//
// The real browser path is covered outside this suite: e2e/auth.setup.ts clicks the "Ingresar"
// button, and Playwright waits for a control to be enabled before clicking it, so a button that
// never enabled would time out there and take the whole e2e run with it.

// vi.mock factories are hoisted above the imports, so the recorder they write into has to be
// hoisted too. Anything captured here is written during a render and read after it.
const react = vi.hoisted(() => ({
  // Every (subscribe, getSnapshot, getServerSnapshot) triple useSyncExternalStore was called
  // with, newest last.
  calls: [] as StoreCall[],
  // Stands in for React's own choice of snapshot. React reads getServerSnapshot on the server
  // and while hydrating, then getSnapshot from the moment the component is live on the client.
  // With no DOM there is no way to make React perform that switch, so a test that needs the
  // client side of it flips this instead. Named for what it is: a stand in, not React.
  readClientSnapshot: false,
}));

type StoreCall = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => unknown;
  getServerSnapshot: (() => unknown) | undefined;
};

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    // Records the call and then hands it straight back to the real implementation, so
    // renderToStaticMarkup below still exercises React's own server behaviour rather than ours.
    useSyncExternalStore<T>(
      subscribe: (onStoreChange: () => void) => () => void,
      getSnapshot: () => T,
      getServerSnapshot?: () => T,
    ): T {
      react.calls.push({ subscribe, getSnapshot, getServerSnapshot });
      if (react.readClientSnapshot) return getSnapshot();
      return actual.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    },
  };
});

// The component under test is the shape every form in the app renders: one button whose disabled
// attribute is the negation of the hook. Asserting on markup rather than on the boolean keeps
// the test honest about what ships, which is an attribute in the HTML the browser holds during
// the unhydrated window.
function SubmitButton() {
  const hydrated = useHydrated();
  return createElement("button", { type: "submit", disabled: !hydrated }, "Ingresar");
}

function lastCall(): StoreCall {
  const call = react.calls.at(-1);
  if (!call) throw new Error("useHydrated did not call useSyncExternalStore");
  return call;
}

afterEach(() => {
  react.calls.length = 0;
  react.readClientSnapshot = false;
});

describe("useHydrated", () => {
  it("is false while rendering on the server, so a submit button ships disabled", () => {
    const markup = renderToStaticMarkup(createElement(SubmitButton));

    expect(markup).toBe('<button type="submit" disabled="">Ingresar</button>');
  });

  it("is true from the client snapshot, so the button is usable once the component is live", () => {
    react.readClientSnapshot = true;

    const markup = renderToStaticMarkup(createElement(SubmitButton));

    // No disabled attribute at all. This is the assertion that fails if the hook ever stops
    // flipping, which would leave every form in the app unusable.
    expect(markup).toBe('<button type="submit">Ingresar</button>');
  });

  it("passes the true snapshot in the client position and the false one in the server position", () => {
    renderToStaticMarkup(createElement(SubmitButton));

    const { getSnapshot, getServerSnapshot } = lastCall();

    // Both snapshots return a boolean, so swapping them compiles and passes typecheck and lint.
    // The only thing that catches it is asserting each one by position.
    expect(getSnapshot()).toBe(true);
    expect(getServerSnapshot).toBeTypeOf("function");
    expect(getServerSnapshot?.()).toBe(false);
  });

  it("subscribes to a store that never changes, and unsubscribing is safe", () => {
    renderToStaticMarkup(createElement(SubmitButton));

    const onStoreChange = vi.fn();
    const unsubscribe = lastCall().subscribe(onStoreChange);

    // If the store ever announced a change, React would re read the snapshot and re render every
    // form in the app for nothing. The hook wants exactly one re render, the one React itself
    // performs when it swaps the server snapshot for the client one.
    expect(onStoreChange).not.toHaveBeenCalled();
    expect(unsubscribe).toBeTypeOf("function");
    expect(() => unsubscribe()).not.toThrow();
    expect(onStoreChange).not.toHaveBeenCalled();
  });

  it("reuses one subscribe function across renders, so React never resubscribes", () => {
    renderToStaticMarkup(createElement(SubmitButton));
    renderToStaticMarkup(createElement(SubmitButton));

    // useSyncExternalStore resubscribes whenever the subscribe function changes identity, so an
    // inline `() => () => {}` in the hook body would tear down and set up a subscription on every
    // single render. Module scope is what stops that, and identity is the only way to see it.
    expect(react.calls).toHaveLength(2);
    expect(react.calls[0].subscribe).toBe(react.calls[1].subscribe);
  });
});
