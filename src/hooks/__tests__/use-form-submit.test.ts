import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useHydrated } from "../use-form-submit";

// The half of the pre-hydration form leak that a static check cannot see: what the SERVER
// actually puts in the HTML. The leak (see src/__tests__/conventions.test.ts) happens in the
// window before React attaches its submit handler, so the only markup that matters is the
// markup the browser holds during that window. If useHydrated ever returned true on the server,
// every submit button would ship enabled and the Enter key would be a native submit again,
// while every static check in the repo stayed green.
//
// This is a node environment with no DOM (vitest.config.ts), so the other half, the button
// becoming usable once the component mounts on the client, is NOT covered here. React drives it
// through useSyncExternalStore's client snapshot, and proving it would need a DOM renderer this
// project does not install.
describe("useHydrated", () => {
  it("is false while rendering on the server, so a submit button ships disabled", () => {
    function SubmitButton() {
      const hydrated = useHydrated();
      return createElement("button", { type: "submit", disabled: !hydrated }, "Ingresar");
    }

    const markup = renderToStaticMarkup(createElement(SubmitButton));

    expect(markup).toBe('<button type="submit" disabled="">Ingresar</button>');
  });
});
