import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { readLocalState, writeLocalState } from "../utils/localState";

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

    return readLocalState(storageKey, fallback);
  });

  useEffect(() => {
    writeLocalState(storageKey, value);
  }, [storageKey, value]);

  return [value, setValue];
}
