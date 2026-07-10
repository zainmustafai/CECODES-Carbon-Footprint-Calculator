"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useDataEntryContext } from "./use-data-entry-context";

// How many of a source's cells hold a reported value, live. Returns a number, so
// useSyncExternalStore never sees a fresh object and never loops.
export function useReportedCount(entryIds: string[]): number {
  const { store } = useDataEntryContext();
  const key = entryIds.join("|");

  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribes = key.split("|").map((id) => store.subscribe(id, onChange));
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    [store, key],
  );

  const getSnapshot = useCallback(
    () => key.split("|").filter((id) => store.getValue(id) !== "").length,
    [store, key],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
