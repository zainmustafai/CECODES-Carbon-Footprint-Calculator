"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isValidEntryValue } from "@/lib/decimal-input";
import { useDataEntryContext } from "./use-data-entry-context";

// How many of a source's cells hold a reported value, live. Returns a number, so
// useSyncExternalStore never sees a fresh object and never loops.
//
// Only VALID values count. An invalid draft ("abc", "12,,5") is displayed but never saved,
// so counting it would show "9 de 12 meses" for a month that will not survive a reload.
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
    () =>
      key.split("|").filter((id) => {
        const value = store.getValue(id);
        return value !== "" && isValidEntryValue(value);
      }).length,
    [store, key],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
