"use client";

import { useCallback, useSyncExternalStore } from "react";
import { STATUS_KEY, type SaveState } from "../lib/entry-store";
import { useDataEntryContext } from "./use-data-entry-context";

const IDLE: SaveState = { kind: "idle" };

export function useSaveStatus(): SaveState {
  const { store } = useDataEntryContext();

  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(STATUS_KEY, onChange),
    [store],
  );

  // The server never has a save in flight, so SSR always renders idle.
  return useSyncExternalStore(subscribe, store.getStatus, () => IDLE);
}
