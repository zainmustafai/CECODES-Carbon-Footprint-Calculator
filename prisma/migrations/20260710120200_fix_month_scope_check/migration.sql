-- Fixes a three-valued-logic hole in activity_entries_month_scope_check.
--
-- The original predicate was:
--   (scope = 'SCOPE_2' AND month BETWEEN 1 AND 12) OR (scope IN ('SCOPE_1','SCOPE_3') AND month IS NULL)
--
-- For a Scope-2 row with month IS NULL that evaluates to (TRUE AND NULL) OR (FALSE AND ...)
--   = NULL OR FALSE
--   = NULL
-- and a CHECK constraint only rejects a row when the predicate is FALSE, never when it is
-- NULL. So a Scope-2 row could be stored with no month: an electricity source with a single
-- annual value, which the roll-up would silently treat as one month's consumption.
--
-- A CASE expression always yields TRUE or FALSE, so it closes the hole.

DELETE FROM "activity_entries" WHERE "scope" = 'SCOPE_2' AND "month" IS NULL;

ALTER TABLE "activity_entries" DROP CONSTRAINT "activity_entries_month_scope_check";

ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_month_scope_check" CHECK (
  CASE
    WHEN "scope" = 'SCOPE_2' THEN "month" IS NOT NULL AND "month" BETWEEN 1 AND 12
    ELSE "month" IS NULL
  END
);
