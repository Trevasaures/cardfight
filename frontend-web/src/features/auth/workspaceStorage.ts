import { readLocalState, removeLocalState, writeLocalState } from "../../utils/localState.ts";
import { readScrollPosition, writeScrollPosition } from "../../utils/viewState.ts";
import { createPlaytestStore } from "../hand-lab/sessionStore.ts";

type Values = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type TabStorage = Values & Pick<Storage, "length" | "key">;
const HOSTED_PREFIX = "cardfight.hosted.v1.";

function accountPrefix(accountId: string) {
  return `${HOSTED_PREFIX}${encodeURIComponent(accountId)}:`;
}

function removeHostedValues(storage: TabStorage, keepPrefix?: string) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(HOSTED_PREFIX) && (!keepPrefix || !key.startsWith(keepPrefix))) {
      keys.push(key);
    }
  }
  // Storage may change enumeration order as entries are removed.
  for (const key of keys) storage.removeItem(key);
}

export function selectHostedAccount(storage: TabStorage, verifiedAccountId: string): void {
  removeHostedValues(storage, accountPrefix(verifiedAccountId));
}

export function clearHostedAccount(storage: TabStorage): void {
  removeHostedValues(storage);
}

/** Capture the key prefix once. A callback from an old React tree cannot write into the next account. */
export function createWorkspaceStorage(
  accountId: string | null,
  getLocalStorage = (): Values => window.localStorage,
  getTabStorage = (): Values => window.sessionStorage,
) {
  const prefix = accountId ? accountPrefix(accountId) : "";
  let active = true;
  function scoped(getStorage: () => Values): Values {
    return {
      getItem(key) { return active ? getStorage().getItem(prefix + key) : null; },
      setItem(key, value) {
        if (!active) throw new Error("Workspace changed.");
        getStorage().setItem(prefix + key, value);
      },
      removeItem(key) { if (active) getStorage().removeItem(prefix + key); },
    };
  }
  const tab = scoped(getTabStorage);
  const preferences = accountId ? tab : scoped(getLocalStorage);
  const playtest = createPlaytestStore(() => tab);

  return {
    read<T>(key: string, fallback: T): T { return readLocalState(key, fallback, preferences); },
    write(key: string, value: unknown): boolean { return writeLocalState(key, value, preferences); },
    remove(key: string): boolean { return active && removeLocalState(key, preferences); },
    readScroll(key: string): number { return readScrollPosition(key, tab); },
    writeScroll(key: string, value: number): void { writeScrollPosition(key, value, tab); },
    playtest: {
      restore: (...args: Parameters<typeof playtest.restore>) => active
        ? playtest.restore(...args)
        : { state: null, backedUp: false, notice: "" },
      save: (...args: Parameters<typeof playtest.save>) => active && playtest.save(...args),
    },
    isActive: () => active,
    revoke() { active = false; playtest.resetMemory(); },
  };
}

export type WorkspaceStorage = ReturnType<typeof createWorkspaceStorage>;
