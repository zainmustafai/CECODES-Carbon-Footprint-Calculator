"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { GwpSet } from "@/lib/generated/prisma/client";
import {
  estimateSourceTonnes,
  type PreviewGridFactor,
  type SourceEstimate,
} from "@/lib/calc/preview";
import type { SourceVM } from "../lib/types";
import { useDataEntryContext } from "./use-data-entry-context";

// The live estimated emissions of one source, recomputed as the user types.
//
// useSyncExternalStore's snapshot MUST be a primitive. Returning a fresh array or object on
// every call makes React see a new value each render and loop forever. The cell values are
// therefore serialized to one JSON string, and the estimate is computed during render.
//
// JSON rather than a delimiter: a cell holds raw keyboard input, so no separator character is
// safe to assume absent. JSON.stringify of identical values is byte-identical, which is
// exactly the stability useSyncExternalStore requires.
//
// Computing during render also keeps the React compiler happy: no state, no effects.
export function useSourceEstimate({
  source,
  gridFactor,
  gwpSet,
}: {
  source: SourceVM;
  gridFactor: PreviewGridFactor | null;
  gwpSet: GwpSet;
}): SourceEstimate {
  const { store } = useDataEntryContext();
  const key = source.cells.map((cell) => cell.entryId).join("|");

  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribes = key.split("|").map((id) => store.subscribe(id, onChange));
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    [store, key],
  );

  const getSnapshot = useCallback(
    () => JSON.stringify(key.split("|").map((id) => store.getValue(id))),
    [store, key],
  );

  const serialized = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return estimateSourceTonnes({
    values: JSON.parse(serialized) as string[],
    scope: source.scope,
    factor: source.factor,
    gridFactor,
    gwpSet,
  });
}
