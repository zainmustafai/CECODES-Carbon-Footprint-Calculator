"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createEntryStore, type DirtyValue, type EntryStore } from "../lib/entry-store";
import { saveEntryValues } from "../actions/entries";

// A change waits this long before it is sent. A blur flushes sooner, so tabbing across the
// twelve month fields of a Scope-2 grid coalesces into a single request instead of twelve.
const CHANGE_DEBOUNCE_MS = 700;
const BLUR_DEBOUNCE_MS = 180;

export type DataEntryContextValue = {
  store: EntryStore;
  reportingYearId: string | null;
  basePath: string;
  readOnly: boolean;
  queueChange: (entryId: string, value: string) => void;
  flushSoon: () => void;
  /** Sends every pending edit now and resolves when the server has them. */
  flushNow: () => Promise<void>;
};

export const DataEntryContext = createContext<DataEntryContextValue | null>(null);

type DataEntryProviderProps = {
  reportingYearId: string | null;
  basePath: string;
  initialValues: Record<string, string>;
  readOnly?: boolean;
  children: React.ReactNode;
};

export function DataEntryProvider({
  reportingYearId,
  basePath,
  initialValues,
  readOnly = false,
  children,
}: DataEntryProviderProps) {
  const t = useTranslations("dataEntry");
  const [store] = useState(() => createEntryStore(initialValues));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Absorb rows added or removed by a server re-render, without clobbering a cell the user
  // is still editing. Serialized so the effect does not fire on every new object identity.
  const valuesKey = JSON.stringify(initialValues);
  useEffect(() => {
    store.hydrate(JSON.parse(valuesKey) as Record<string, string>);
  }, [store, valuesKey]);

  const flush = useCallback(async () => {
    if (!reportingYearId || !store.hasDirty()) return;

    const batch: DirtyValue[] = store.takeDirty();
    store.beginSave();

    const { error } = await saveEntryValues({ reportingYearId, values: batch });
    if (error) {
      store.rollback(batch);
      toast.error(t(`errors.${error}`));
      return;
    }
    store.commit(batch);
  }, [store, reportingYearId, t]);

  const schedule = useCallback(
    (delay: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  const queueChange = useCallback(
    (entryId: string, value: string) => {
      store.setValue(entryId, value);
      schedule(CHANGE_DEBOUNCE_MS);
    },
    [store, schedule],
  );

  const flushSoon = useCallback(() => schedule(BLUR_DEBOUNCE_MS), [schedule]);

  // Any action that makes the server read a cell it has not received yet (copying January
  // across, for instance) must first drain the debounce, or it reads a stale value.
  const flushNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await flush();
  }, [flush]);

  // Never strand an edit that is still inside its debounce window. On unmount (a route
  // change) send it immediately; before a reload, warn instead, since the request would be
  // cancelled in flight.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (store.hasDirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timerRef.current) clearTimeout(timerRef.current);
      void flushRef.current();
    };
  }, [store]);

  const value = useMemo<DataEntryContextValue>(
    () => ({ store, reportingYearId, basePath, readOnly, queueChange, flushSoon, flushNow }),
    [store, reportingYearId, basePath, readOnly, queueChange, flushSoon, flushNow],
  );

  return <DataEntryContext.Provider value={value}>{children}</DataEntryContext.Provider>;
}
