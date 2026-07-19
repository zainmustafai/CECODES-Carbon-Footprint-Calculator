import type { EntryChangeAction } from "@/lib/generated/prisma/client";

// Maps a data-entry audit action to the i18n key of the plain-Spanish sentence that describes
// it (admin.traceability.sentences.*). Kept pure and separate from the query so it is unit
// tested against the exact `changes` JSON shapes the four write sites in
// src/features/data-entry/actions/entries.ts produce.
//
// The one branch that is not one-action-one-key: a VALUE_SET with no previous value reads as
// "ingresó" (entered), while replacing an existing value reads as "cambió" (changed). The audit
// stores from = null for a first entry, so `from` is what distinguishes them.
export type EntryChangeSentenceKey =
  | "valueSet"
  | "valueEntered"
  | "valueCleared"
  | "sourceAdded"
  | "sourceRemoved"
  | "copied";

export function entryChangeSentenceKey(
  action: EntryChangeAction,
  from: string | null,
): EntryChangeSentenceKey {
  switch (action) {
    case "VALUE_SET":
      return from === null ? "valueEntered" : "valueSet";
    case "VALUE_CLEARED":
      return "valueCleared";
    case "SOURCE_ADDED":
      return "sourceAdded";
    case "SOURCE_REMOVED":
      return "sourceRemoved";
    case "COPIED":
      return "copied";
  }
}
