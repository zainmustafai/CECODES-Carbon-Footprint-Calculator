"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { GwpSet } from "@/lib/generated/prisma/client";
import {
  estimateSourceTonnes,
  type PreviewGridFactor,
  type PreviewSubsidyPrice,
  type SourceEstimate,
} from "@/lib/calc/preview";
import type { SourceVM } from "../lib/types";
import { useDataEntryContext } from "./use-data-entry-context";

// Mirrors data-entry-provider.tsx's SECONDARY_KEY_SUFFIX: a COUNT_TIMES_DISTANCE source's
// distance half lives under this synthetic store key (client feedback 2026-08-15).
const SECONDARY_KEY_SUFFIX = ":secondary";

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
  pricePerGallon,
  gwpSet,
}: {
  source: SourceVM;
  gridFactor: PreviewGridFactor | null;
  pricePerGallon: PreviewSubsidyPrice | null;
  gwpSet: GwpSet;
}): SourceEstimate {
  const { store } = useDataEntryContext();
  const key = source.cells.map((cell) => cell.entryId).join("|");
  // Only meaningful for COUNT_TIMES_DISTANCE, but harmless to always compute: it is just a
  // second set of store keys, and the store returns "" for a key nothing ever wrote to.
  const secondaryKey = source.cells.map((cell) => `${cell.entryId}${SECONDARY_KEY_SUFFIX}`).join("|");

  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribes = [...key.split("|"), ...secondaryKey.split("|")].map((id) =>
        store.subscribe(id, onChange),
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    [store, key, secondaryKey],
  );

  const getSnapshot = useCallback(
    () =>
      JSON.stringify([
        key.split("|").map((id) => store.getValue(id)),
        secondaryKey.split("|").map((id) => store.getValue(id)),
      ]),
    [store, key, secondaryKey],
  );

  const serialized = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [values, secondaryValues] = JSON.parse(serialized) as [string[], string[]];

  return estimateSourceTonnes({
    values,
    secondaryValues,
    scope: source.scope,
    category: source.category,
    factor: source.factor,
    gridFactor,
    pricePerGallon,
    gwpSet,
  });
}
