"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readStored, writeStored } from "./storage.ts";

const KEY = "fixpoint-admin-token";
const EVENT = "fixpoint-admin-token";
/** The token when localStorage refuses it (private modes, blocked site data): it then lasts until reload. */
let unsaved: string | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** The admin token, kept in this browser. Admin controls render only when it's set; the API still checks it. */
export function useAdminToken(): [string | null, (token: string | null) => void] {
  const token = useSyncExternalStore(subscribe, () => readStored(KEY) ?? unsaved, () => null);
  const setToken = useCallback((next: string | null) => {
    const value = next?.trim() || null;
    unsaved = writeStored(KEY, value) ? null : value;
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [token, setToken];
}
