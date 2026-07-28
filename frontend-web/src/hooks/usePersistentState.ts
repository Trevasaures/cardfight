import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

type InitialState<T> = T | (() => T);

function resolveInitialState<T>(initialState: InitialState<T>) {
  return typeof initialState === "function"
    ? (initialState as () => T)()
    : initialState;
}

export function usePersistentState<T>(
  storageKey: string,
  initialState: InitialState<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback = resolveInitialState(initialState);

    if (typeof window === "undefined") return fallback;

    try {
      const storedValue = window.localStorage.getItem(storageKey);
      return storedValue === null ? fallback : (JSON.parse(storedValue) as T);
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Local persistence is a convenience. The page remains usable if storage
      // is unavailable, full, or disabled by the browser.
    }
  }, [storageKey, value]);

  return [value, setValue];
}
