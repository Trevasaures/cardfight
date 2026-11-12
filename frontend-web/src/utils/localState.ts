/** Browser preferences are optional; unavailable storage must not block actions. */
export function readLocalState<T>(key: string, fallback: T, storage?: Pick<Storage, "getItem">): T {
  try {
    const stored = (storage ?? window.localStorage).getItem(key);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

export function writeLocalState(key: string, value: unknown, storage?: Pick<Storage, "setItem">): boolean {
  try {
    (storage ?? window.localStorage).setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeLocalState(key: string, storage?: Pick<Storage, "removeItem">): boolean {
  try {
    (storage ?? window.localStorage).removeItem(key);
    return true;
  } catch {
    return false;
  }
}
