type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage is missing during server render and throws in some private modes; both read as "nothing stored". */
function local(): Store | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readStored(key: string, store: Store | undefined = local()): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null, store: Store | undefined = local()): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    // Not persisted; the in-page state still applies until reload.
  }
}
