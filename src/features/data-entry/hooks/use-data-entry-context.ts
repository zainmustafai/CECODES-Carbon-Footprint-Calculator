"use client";

import { useContext } from "react";
import { DataEntryContext } from "../components/data-entry-provider";

export function useDataEntryContext() {
  const context = useContext(DataEntryContext);
  if (!context) {
    throw new Error("useDataEntryContext must be used inside a DataEntryProvider");
  }
  return context;
}
