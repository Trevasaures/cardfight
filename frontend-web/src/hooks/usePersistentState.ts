import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useWorkspace } from "../features/auth/workspaceContext";

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
  const { storage } = useWorkspace();
  const [value, setValue] = useState<T>(() => {
    const fallback = resolveInitialState(initialState);

    return storage.read(storageKey, fallback);
  });

  useEffect(() => {
    storage.write(storageKey, value);
  }, [storage, storageKey, value]);

  return [value, setValue];
}
