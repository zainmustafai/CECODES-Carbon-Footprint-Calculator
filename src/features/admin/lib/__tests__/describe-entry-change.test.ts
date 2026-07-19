import { describe, expect, it } from "vitest";
import { entryChangeSentenceKey } from "../describe-entry-change";

// The sentence key drives which plain-Spanish line the traceability feed renders. The only
// non-trivial branch is VALUE_SET: entering a first value reads "ingresó", replacing an existing
// one reads "cambió", and the audit distinguishes them by whether `from` was null.
describe("entryChangeSentenceKey", () => {
  it("reads a first value as 'entered' and a replacement as 'changed'", () => {
    expect(entryChangeSentenceKey("VALUE_SET", null)).toBe("valueEntered");
    expect(entryChangeSentenceKey("VALUE_SET", "0")).toBe("valueSet");
    expect(entryChangeSentenceKey("VALUE_SET", "100.5")).toBe("valueSet");
  });

  it("maps clearing and the structural actions one to one", () => {
    expect(entryChangeSentenceKey("VALUE_CLEARED", "100")).toBe("valueCleared");
    expect(entryChangeSentenceKey("SOURCE_ADDED", null)).toBe("sourceAdded");
    expect(entryChangeSentenceKey("SOURCE_REMOVED", null)).toBe("sourceRemoved");
    expect(entryChangeSentenceKey("COPIED", null)).toBe("copied");
  });
});
