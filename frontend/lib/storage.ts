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

/** Returns whether the value was persisted; when it wasn't, the caller keeps it in memory until reload. */
export function writeStored(key: string, value: string | null, store: Store | undefined = local()): boolean {
  if (!store) return false;
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
