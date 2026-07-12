"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getCompanyName } from "../actions/get-company-name";

// A module-level cache so moving between a company's pages does not refetch its name, read
// through useSyncExternalStore so every consumer (sidebar header, breadcrumb) updates at once.
const cache = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function emit() {
  for (const listener of listeners) listener();
}

// The shell layout renders above app/(app)/admin/companies/[companyId]/layout.tsx, so it
// cannot read that segment's data. It asks the server instead.
export function useCompanyName(companyId: string | null | undefined): string | null {
  const getSnapshot = useCallback(
    () => (companyId ? (cache.get(companyId) ?? null) : null),
    [companyId],
  );

  const name = useSyncExternalStore(subscribe, getSnapshot, () => null);

  useEffect(() => {
    if (!companyId || cache.has(companyId)) return;
    let active = true;
    getCompanyName(companyId).then(({ name: resolved }) => {
      if (!active || !resolved) return;
      cache.set(companyId, resolved);
      emit();
    });
    return () => {
      active = false;
    };
  }, [companyId]);

  return name;
}
