"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// A thin progress bar across the very top of the viewport, shown the instant a navigation
// starts and finished when the destination commits. It is the app-wide answer to "nothing
// may feel stuck": a click on a sidebar item, a filter change, or the browser back button all
// get immediate feedback even when the next route takes a moment to load.
//
// The App Router exposes no "navigation started" event, so, like the community top-loader
// libraries, this patches history.pushState / replaceState (which both a <Link> click and
// router.push call) and listens for popstate (back and forward). Completion is detected the
// normal way: this component lives in the root layout, so when the destination renders it
// re-runs with a new pathname or searchParams, and the effect below finishes the bar.

const TRICKLE_CEILING = 90; // never reach 100 until the navigation actually completes
const DONE_LINGER_MS = 200; // let the 100% frame and the fade paint before resetting

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // width 0..100. `visible` gates opacity so the bar can fade out rather than vanish.
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  function clearTimers() {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    if (doneRef.current) {
      clearTimeout(doneRef.current);
      doneRef.current = null;
    }
  }

  // Starts (or restarts) the bar. Trickles toward the ceiling in ever smaller steps, so a slow
  // route keeps moving without ever pretending to be finished.
  function start() {
    if (activeRef.current) return;
    activeRef.current = true;

    clearTimers();
    setVisible(true);
    setWidth(8);

    trickleRef.current = setInterval(() => {
      setWidth((current) => {
        if (current >= TRICKLE_CEILING) return current;
        const remaining = TRICKLE_CEILING - current;
        return current + Math.max(0.5, remaining * 0.08);
      });
    }, 200);
  }

  // Completes the bar: snap to 100, fade, then reset so the next navigation starts clean.
  function done() {
    if (!activeRef.current) return;
    activeRef.current = false;

    clearTimers();
    setWidth(100);
    doneRef.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, DONE_LINGER_MS);
  }

  // Patch history and listen for back/forward once, on mount. The original methods are always
  // called, so Next's own routing is untouched.
  useEffect(() => {
    const originalPush = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);

    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      start();
      return originalPush(...args);
    };
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      start();
      return originalReplace(...args);
    };
    window.addEventListener("popstate", start);

    return () => {
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      window.removeEventListener("popstate", start);
      clearTimers();
    };
    // start/done are stable in behaviour; deliberately mounted once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The destination has rendered: the URL this component now sees is the new one, so finish.
  useEffect(() => {
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (!visible && width === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--primary)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
