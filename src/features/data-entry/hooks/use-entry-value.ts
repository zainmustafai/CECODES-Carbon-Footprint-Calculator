"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isValidEntryValue } from "../schemas/entry-schemas";
import { useDataEntryContext } from "./use-data-entry-context";

// Binds one cell to the store. Subscribing per entryId means a keystroke in Enero does not
// re-render the other eleven months.
export function useEntryValue(entryId: string) {
  const { store, queueChange, flushSoon, readOnly } = useDataEntryContext();

  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(entryId, onChange),
    [store, entryId],
  );
  const getSnapshot = useCallback(() => store.getValue(entryId), [store, entryId]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const invalid = !isValidEntryValue(value);

  const onChange = useCallback(
    (next: string) => {
      // An unparseable draft ("12,") stays on screen so the caret does not jump, but it is
      // not marked dirty and so never reaches the server.
      if (isValidEntryValue(next)) queueChange(entryId, next);
      else store.setValue(entryId, next, false);
    },
    [store, entryId, queueChange],
  );

  const onBlur = useCallback(() => {
    if (isValidEntryValue(store.getValue(entryId))) flushSoon();
  }, [store, entryId, flushSoon]);

  return { value, invalid, onChange, onBlur, readOnly };
}
