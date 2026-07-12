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
// router.push call) and listens for popstate. Completion is detected the normal way: this
// component lives in the root layout, so when the destination renders it re-runs with a new
// pathname or searchParams, and the effect below finishes the bar.
//
// TWO constraints, both proven the hard way, shape the machine below:
//
// 1. The App Router calls history.pushState from inside a React INSERTION effect during
//    navigation, where scheduling a state update is illegal ("useInsertionEffect must not
//    schedule updates"). So `start` NEVER calls setState; it flips refs and schedules a frame,
//    and the frame (which runs after the commit) moves the React state.
//
// 2. That deferred "show" must not be cancellable by completion. A prefetched route commits and
//    fires the completion effect within a few ms, BEFORE the browser reaches the animation
//    frame where the show would run. If completion cancelled the pending frame, the bar would
//    never become visible (it would jump straight to done, at opacity 0). So `done` does not
//    cancel a pending show: it either waits for the show to paint, or, once shown, holds the
//    bar on screen for MIN_VISIBLE_MS so even an instant navigation is perceptible.

const TRICKLE_CEILING = 90; // never reach 100 until the navigation actually completes
const MIN_VISIBLE_MS = 400; // once shown, stay long enough to register on an instant navigation
const DONE_LINGER_MS = 200; // let the 100% frame and the fade paint before resetting
const STUCK_TIMEOUT_MS = 10_000; // a navigation that never changes the URL cannot strand the bar

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // width 0..100. `visible` gates opacity so the bar can fade out rather than vanish.
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stuckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(false); // a navigation is in flight
  const shownAtRef = useRef<number | null>(null); // when the bar actually painted, or null
  const finishPendingRef = useRef(false); // completion arrived before the bar painted

  function clearTimers() {
    if (trickleRef.current) clearInterval(trickleRef.current);
    if (doneRef.current) clearTimeout(doneRef.current);
    if (stuckRef.current) clearTimeout(stuckRef.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    trickleRef.current = null;
    doneRef.current = null;
    stuckRef.current = null;
    rafRef.current = null;
  }

  // Called from the patched history methods, i.e. potentially inside an insertion effect.
  // It must NOT touch React state synchronously: it only flips refs and schedules a frame.
  function start() {
    if (activeRef.current) return;
    activeRef.current = true;
    shownAtRef.current = null;
    finishPendingRef.current = false;

    clearTimers();
    rafRef.current = requestAnimationFrame(show);
  }

  // Runs after the navigation commit, so setState here is legal. Paints the bar and starts the
  // trickle. If completion already arrived while we were waiting for this frame, finish now.
  function show() {
    rafRef.current = null;
    shownAtRef.current = performance.now();

    setVisible(true);
    setWidth(8);

    // Trickle toward the ceiling in ever smaller steps, so a slow route keeps moving
    // without ever pretending to be finished.
    trickleRef.current = setInterval(() => {
      setWidth((current) => {
        if (current >= TRICKLE_CEILING) return current;
        const remaining = TRICKLE_CEILING - current;
        return current + Math.max(0.5, remaining * 0.08);
      });
    }, 200);

    // A navigation that never changes pathname or searchParams (a hash link, a no-op push)
    // would otherwise leave the bar stranded at the ceiling. Auto-complete after a while.
    stuckRef.current = setTimeout(done, STUCK_TIMEOUT_MS);

    if (finishPendingRef.current) finish();
  }

  // The navigation completed. Called from the pathname/searchParams effect and the stuck timer.
  function done() {
    if (!activeRef.current) return;
    activeRef.current = false;

    // The bar has not painted yet (fast route: completion beat the show frame). Do NOT cancel
    // the pending frame; let it paint, then it will call finish() itself.
    if (shownAtRef.current === null) {
      finishPendingRef.current = true;
      return;
    }
    finish();
  }

  // Snap to 100, fade, reset. Held back so the bar stays on screen at least MIN_VISIBLE_MS,
  // otherwise an instant navigation would complete before the eye could catch it.
  function finish() {
    if (stuckRef.current) {
      clearTimeout(stuckRef.current);
      stuckRef.current = null;
    }

    const elapsed = performance.now() - (shownAtRef.current ?? performance.now());
    const hold = Math.max(0, MIN_VISIBLE_MS - elapsed);

    doneRef.current = setTimeout(() => {
      if (trickleRef.current) {
        clearInterval(trickleRef.current);
        trickleRef.current = null;
      }
      setWidth(100);
      doneRef.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
        shownAtRef.current = null;
        finishPendingRef.current = false;
      }, DONE_LINGER_MS);
    }, hold);
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
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--primary)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
