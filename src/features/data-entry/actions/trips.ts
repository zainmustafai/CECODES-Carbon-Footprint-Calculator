"use server";

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ScopeError,
  resolveReportingYearScope,
  scopeErrorKey,
} from "@/lib/auth/company-scope";
import { saveTransportTripsInput } from "../schemas/trip-schemas";
import { auditKey, revalidate } from "./shared";

// Replaces the whole trip set of one source in a single transaction. A wholesale swap rather
// than per-row create/update/delete: the set is small, the client always holds all of it, and
// replacing has no ordering races and leaves no orphan rows to reconcile.
//
// Client feedback 2026-09-03 (E3): C4, C6, C7 and C9 are one row per route in the templates
// CECODES sent, so the tool multiplies each route and adds them instead of asking the user to
// pre-multiply by hand.
export async function saveTransportTrips(input: unknown): Promise<{ error?: string }> {
  const parsed = saveTransportTripsInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { reportingYearId, entryId, trips } = parsed.data;

  try {
    // Authorize FIRST, from the reporting year, never from an argument. Server Actions are
    // public POST endpoints and no layout guard has run for this call.
    const scope = await resolveReportingYearScope(reportingYearId);

    // The entry must belong to this year AND this company, and its factor must actually be a
    // count-times-distance source: nothing else has trips, and writing value/secondaryValue on
    // a QUANTITY source would corrupt it. Anything else is "not found", which is also what an
    // entry belonging to another company looks like from here.
    const entry = await prisma.activityEntry.findFirst({
      where: { id: entryId, reportingYearId, companyId: scope.companyId },
      select: {
        value: true,
        scope: true,
        element: true,
        emissionFactorId: true,
        emissionFactor: { select: { entryMode: true } },
      },
    });
    if (!entry || entry.emissionFactor?.entryMode !== "COUNT_TIMES_DISTANCE") {
      throw new ScopeError("not-found");
    }

    // Decimal arithmetic, not float: this number is persisted. Each route's PRODUCT is added,
    // never the product of the sums, matching rollup.ts's COUNT_TIMES_DISTANCE branch.
    const total = trips.reduce(
      (sum, trip) => sum.add(new Prisma.Decimal(trip.count).mul(trip.distanceKm)),
      new Prisma.Decimal(0),
    );
    const cleared = trips.length === 0;

    await prisma.$transaction(async (tx) => {
      // A count of 0 is legitimate here: a source being given its first routes has none to
      // delete. companyId is on the where clause anyway, so a spoofed entry id matches nothing.
      await tx.transportTrip.deleteMany({
        where: { activityEntryId: entryId, companyId: scope.companyId },
      });

      if (!cleared) {
        await tx.transportTrip.createMany({
          data: trips.map((trip, position) => ({
            activityEntryId: entryId,
            companyId: scope.companyId,
            position,
            reference: trip.reference,
            count: trip.count,
            distanceKm: trip.distanceKm,
            note: trip.note,
          })),
        });
      }

      // The invariant the whole feature rests on: value is the sum of the products and
      // secondaryValue is 1, so the legacy value x secondaryValue path can never disagree with
      // the trip path. Everything that knows only about the two columns keeps working
      // unchanged: the live estimate on the row, "was this source reported", and any entry
      // saved before trip rows existed.
      const updated = await tx.activityEntry.updateMany({
        where: { id: entryId, reportingYearId, companyId: scope.companyId },
        data: {
          value: cleared ? null : total,
          secondaryValue: cleared ? null : new Prisma.Decimal(1),
        },
      });
      // updateMany reports { count: 0 } instead of throwing, so an unchecked count would report
      // success on a write that matched nothing.
      if (updated.count !== 1) throw new ScopeError("not-found");

      await tx.activityEntryChange.create({
        data: {
          ...auditKey(scope, reportingYearId),
          emissionFactorId: entry.emissionFactorId,
          scope: entry.scope,
          element: entry.element,
          month: null,
          action: cleared ? "VALUE_CLEARED" : "VALUE_SET",
          // One row for the whole set, not one per route: what the user did was "these are my
          // routes now". The trip count rides along so the log stays legible without joining
          // back to a child table the audit deliberately does not reference.
          changes: {
            value: {
              from: entry.value === null ? null : entry.value.toString(),
              to: cleared ? null : total.toString(),
            },
            trips: trips.length,
          },
        },
      });
    });

    revalidate(scope);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
