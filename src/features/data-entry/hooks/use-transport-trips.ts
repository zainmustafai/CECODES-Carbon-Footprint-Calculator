"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useToastAction } from "@/hooks/use-toast-action";
import { saveTransportTrips } from "../actions/trips";
import { isValidTripNumber } from "../schemas/trip-schemas";
import type { TripVM } from "../lib/types";
import { useDataEntryContext } from "./use-data-entry-context";

/** A route while it is being edited. `key` is a client-side identity only: it keeps an input
 *  focused when a row above it is removed, and it never reaches the server, which rewrites
 *  every position from the array order. */
export type TripDraft = TripVM & { key: string };

let nextKey = 0;

function toDraft(trip: TripVM): TripDraft {
  return { ...trip, key: `trip-${(nextKey += 1)}` };
}

/** A row is sent only once BOTH numbers parse. A half-filled route is a draft, not a zero. */
function isComplete(row: TripDraft): boolean {
  return isValidTripNumber(row.count) && isValidTripNumber(row.distanceKm);
}

function payloadOf(rows: TripDraft[]) {
  return rows.filter(isComplete).map((row) => ({
    reference: row.reference,
    count: row.count,
    distanceKm: row.distanceKm,
    note: row.note,
  }));
}

// The routes of one COUNT_TIMES_DISTANCE source, held locally and saved as a whole set.
//
// Deliberately NOT in the autosave store (lib/entry-store.ts): hydrate() deletes any key the
// incoming map does not carry, so a table of N rows would have to be flattened into synthetic
// keys and taught to the store, and the ":secondary" key convention is already duplicated in
// three files. The set is small and the save is one request, so local state plus a rollback is
// the whole mechanism.
export function useTransportTrips({
  entryId,
  initial,
}: {
  entryId: string;
  initial: TripVM[];
}) {
  const t = useTranslations("dataEntry.trips");
  const te = useTranslations("dataEntry.errors");
  const { reportingYearId, readOnly } = useDataEntryContext();
  const { isPending, run } = useToastAction();

  const [rows, setRows] = useState<TripDraft[]>(() => initial.map(toDraft));
  // A ref shadows the state so a blur that lands in the same task as the keystroke before it
  // still sends what the user actually typed, rather than the previous render's rows.
  const latest = useRef<TripDraft[]>(rows);
  // The last set the server confirmed. A failed save snaps the table back to it: the screen
  // must never keep showing routes the server refused, per the optimistic-write convention.
  //
  // Seeded once and never re-seeded from props. run() refreshes the route on success, so the
  // props that come back are what we just sent; re-seeding on every prop change would instead
  // discard whatever the user has typed since.
  const confirmed = useRef<TripDraft[]>(rows);

  function put(next: TripDraft[]) {
    latest.current = next;
    setRows(next);
  }

  function commit(next: TripDraft[]) {
    put(next);
    if (!reportingYearId || readOnly) return;
    // Nothing the server would store has changed (a blank new row, or an edit to a route whose
    // numbers still do not parse), so there is nothing to save and no toast to show.
    const payload = payloadOf(next);
    if (JSON.stringify(payload) === JSON.stringify(payloadOf(confirmed.current))) return;

    void run(() => saveTransportTrips({ reportingYearId, entryId, trips: payload }), {
      loading: t("saving"),
      success: t("saved"),
      // The action answers with an opaque key. "forbidden" and "generic" are the two it can
      // produce and both live in the shared catalog; anything else falls back to this
      // section's own message rather than printing a raw key at the user.
      errorMessage: (key) => (te.has(key) ? te(key) : t("error")),
    }).then((ok) => {
      if (ok) confirmed.current = next;
      else put(confirmed.current);
    });
  }

  return {
    rows,
    isPending,
    readOnly,

    /** Typing. Saving waits for the blur, so a half-typed "12," never reaches the server. */
    update(key: string, field: keyof TripVM, value: string) {
      put(latest.current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    },

    /** An empty row is a draft: it is not sent until both of its numbers parse. */
    add() {
      put([...latest.current, toDraft({ reference: "", count: "", distanceKm: "", note: "" })]);
    },

    remove(key: string) {
      commit(latest.current.filter((row) => row.key !== key));
    },

    /** Blur. Sends the whole set if it now differs from what the server holds. */
    flush() {
      commit(latest.current);
    },
  };
}
