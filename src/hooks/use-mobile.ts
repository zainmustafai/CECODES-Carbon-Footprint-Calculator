import * as React from "react"

// lg. Below this the sidebar collapses into a Sheet; at or above it becomes an icon rail.
const MOBILE_BREAKPOINT = 1024

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

// matchMedia is an external store, so read it as one. The block's original version called
// setState inside an effect, which cascades a render on every mount.
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false, // the server has no viewport; assume desktop and let hydration correct it
  )
}
