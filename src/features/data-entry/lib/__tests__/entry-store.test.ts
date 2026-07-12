import { describe, expect, it, vi } from "vitest";
import { STATUS_KEY, createEntryStore } from "../entry-store";

describe("createEntryStore", () => {
  it("marks a changed cell dirty and hands it to exactly one flush", () => {
    const store = createEntryStore({ a: "1", b: "2" });

    store.setValue("a", "10");
    expect(store.hasDirty()).toBe(true);

    expect(store.takeDirty()).toEqual([{ entryId: "a", value: "10" }]);
    expect(store.hasDirty()).toBe(false);
    expect(store.takeDirty()).toEqual([]);
  });

  it("does not mark an invalid draft dirty, so it cannot sink someone else's batch", () => {
    const store = createEntryStore({ a: "1" });

    store.setValue("a", "12,", false);

    expect(store.getValue("a")).toBe("12,"); // still on screen
    expect(store.hasDirty()).toBe(false); // but never sent
  });

  it("rolls a failed cell back to the last value the server confirmed", () => {
    const store = createEntryStore({ a: "1" });

    store.setValue("a", "99");
    const batch = store.takeDirty();
    store.beginSave();
    store.rollback(batch);

    expect(store.getValue("a")).toBe("1");
    expect(store.getStatus()).toEqual({ kind: "error" });
  });

  it("leaves a cell alone on rollback when the user kept typing into it", () => {
    const store = createEntryStore({ a: "1" });

    store.setValue("a", "99");
    const batch = store.takeDirty();
    store.beginSave();
    // The user keeps editing while the batch is in flight.
    store.setValue("a", "995");

    store.rollback(batch);

    // Snapping to "1" here would eat live keystrokes to report a stale failure. The newer
    // value stays on screen, stays dirty, and rides the next flush.
    expect(store.getValue("a")).toBe("995");
    expect(store.hasDirty()).toBe(true);
    expect(store.getStatus()).toEqual({ kind: "error" });
  });

  it("reports isSaving while a batch is in flight, even though nothing is dirty", () => {
    const store = createEntryStore({ a: "1" });

    store.setValue("a", "2");
    const batch = store.takeDirty();
    store.beginSave();

    // The reload guard needs this window covered: dirty is empty, the request is not done.
    expect(store.hasDirty()).toBe(false);
    expect(store.isSaving()).toBe(true);

    store.commit(batch);
    expect(store.isSaving()).toBe(false);
  });

  it("keeps a committed value and reports saved", () => {
    const store = createEntryStore({ a: "1" });

    store.setValue("a", "99");
    const batch = store.takeDirty();
    store.beginSave();
    store.commit(batch);

    expect(store.getValue("a")).toBe("99");
    expect(store.getStatus().kind).toBe("saved");

    // A later failure on the same cell must roll back to 99, not to 1.
    store.setValue("a", "5");
    const second = store.takeDirty();
    store.beginSave();
    store.rollback(second);
    expect(store.getValue("a")).toBe("99");
  });

  it("stays 'saving' until the last in-flight batch settles", () => {
    const store = createEntryStore({ a: "1", b: "2" });

    store.beginSave();
    store.beginSave();
    expect(store.getStatus().kind).toBe("saving");

    store.commit([{ entryId: "a", value: "1" }]);
    expect(store.getStatus().kind).toBe("saving");

    store.commit([{ entryId: "b", value: "2" }]);
    expect(store.getStatus().kind).toBe("saved");
  });

  it("notifies only the cell that changed, plus the status channel", () => {
    const store = createEntryStore({ a: "1", b: "2" });
    const onA = vi.fn();
    const onB = vi.fn();
    const onStatus = vi.fn();
    store.subscribe("a", onA);
    store.subscribe("b", onB);
    store.subscribe(STATUS_KEY, onStatus);

    store.setValue("a", "3");

    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();

    store.beginSave();
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it("hydrate learns new rows and forgets deleted ones", () => {
    const store = createEntryStore({ a: "1" });

    store.hydrate({ a: "1", b: "7" }); // a source was added
    expect(store.getValue("b")).toBe("7");

    store.hydrate({ b: "7" }); // a source was removed
    expect(store.getValue("a")).toBe("");
  });

  it("hydrate does not clobber a cell the user is still editing", () => {
    const store = createEntryStore({ a: "1" });

    store.setValue("a", "999"); // dirty, not yet flushed
    store.hydrate({ a: "1" }); // a stale server render arrives

    expect(store.getValue("a")).toBe("999");
    expect(store.hasDirty()).toBe(true);
  });

  it("hydrate adopts a server value for a clean cell, such as after copying January", () => {
    const store = createEntryStore({ a: "1" });

    store.hydrate({ a: "42" });

    expect(store.getValue("a")).toBe("42");
    expect(store.hasDirty()).toBe(false);
  });
});
