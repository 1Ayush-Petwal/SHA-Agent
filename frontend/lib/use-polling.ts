"use client";

import { useEffect } from "react";

/** Calls `load` now and whenever it changes, then every `ms` while `active` (a run is in progress). */
export function usePolling(load: () => Promise<unknown>, active: boolean, ms = 5000): void {
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), ms);
    return () => clearInterval(timer);
  }, [load, active, ms]);
}
