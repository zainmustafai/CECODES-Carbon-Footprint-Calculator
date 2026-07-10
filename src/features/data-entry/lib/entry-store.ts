export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error" };

export const STATUS_KEY = "__status__";

export type DirtyValue = { entryId: string; value: string };

// A tiny external store read through useSyncExternalStore. Each cell subscribes to its own
// entryId, so typing in one month field does not re-render the other eleven, and the context
// bar subscribes to the aggregate save status. The stack has no state library and this needs
// none.
export function createEntryStore(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  const saved = new Map(values);
  const dirty = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();

  let status: SaveState = { kind: "idle" };
  let inflight = 0;

  function notify(key: string) {
    const subs = listeners.get(key);
    if (subs) for (const fn of subs) fn();
  }

  function setStatus(next: SaveState) {
    status = next;
    notify(STATUS_KEY);
  }

  return {
    subscribe(key: string, onChange: () => void) {
      let subs = listeners.get(key);
      if (!subs) {
        subs = new Set();
        listeners.set(key, subs);
      }
      subs.add(onChange);
      return () => {
        subs.delete(onChange);
        if (subs.size === 0) listeners.delete(key);
      };
    },

    getValue(entryId: string): string {
      return values.get(entryId) ?? "";
    },

    getStatus(): SaveState {
      return status;
    },

    // Optimistic write. The cell shows it immediately; the flush confirms it later.
    // `markDirty` is false while the user is mid-typing something unparseable ("12,"), so an
    // invalid draft is displayed but can never ride along in someone else's batch and take
    // the whole transaction down with it.
    setValue(entryId: string, value: string, markDirty = true) {
      if (values.get(entryId) === value) return;
      values.set(entryId, value);
      if (markDirty) dirty.add(entryId);
      else dirty.delete(entryId);
      notify(entryId);
    },

    hasDirty(): boolean {
      return dirty.size > 0;
    },

    // Hands the dirty set to a flush and clears it. Anything typed after this point becomes
    // dirty again and rides the next flush.
    takeDirty(): DirtyValue[] {
      const batch = [...dirty].map((entryId) => ({
        entryId,
        value: values.get(entryId) ?? "",
      }));
      dirty.clear();
      return batch;
    },

    beginSave() {
      inflight += 1;
      setStatus({ kind: "saving" });
    },

    commit(batch: DirtyValue[]) {
      for (const { entryId, value } of batch) saved.set(entryId, value);
      inflight = Math.max(0, inflight - 1);
      if (inflight === 0) setStatus({ kind: "saved", at: Date.now() });
    },

    // Roll the failed cells back to the last value the server confirmed.
    rollback(batch: DirtyValue[]) {
      for (const { entryId } of batch) {
        const previous = saved.get(entryId) ?? "";
        if (values.get(entryId) !== previous) {
          values.set(entryId, previous);
          notify(entryId);
        }
        dirty.delete(entryId);
      }
      inflight = Math.max(0, inflight - 1);
      setStatus({ kind: "error" });
    },

    // A server re-render (after adding or removing a source, or copying January across) can
    // introduce or drop rows. Learn the new ones and forget the gone ones without clobbering
    // anything the user is still editing.
    hydrate(next: Record<string, string>) {
      let changed = false;
      for (const [entryId, value] of Object.entries(next)) {
        if (!values.has(entryId)) {
          values.set(entryId, value);
          saved.set(entryId, value);
          changed = true;
        } else if (!dirty.has(entryId) && saved.get(entryId) !== value) {
          values.set(entryId, value);
          saved.set(entryId, value);
          notify(entryId);
        }
      }
      for (const entryId of [...values.keys()]) {
        if (!(entryId in next)) {
          values.delete(entryId);
          saved.delete(entryId);
          dirty.delete(entryId);
          changed = true;
        }
      }
      return changed;
    },
  };
}

export type EntryStore = ReturnType<typeof createEntryStore>;
