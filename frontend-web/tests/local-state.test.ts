import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
  readLocalState,
  removeLocalState,
  writeLocalState,
} from "../src/utils/localState.ts";

function browserStorage(context: TestContext, storage: object) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: storage,
  });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
}

test("preferences preserve falsy JSON values and structured navigation state", (context) => {
  const values = new Map<string, string>();
  browserStorage(context, {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });

  for (const value of [false, 0, "", null, { deckId: 14, versionId: 25 }]) {
    assert.equal(writeLocalState("preference", value), true);
    assert.deepEqual(readLocalState("preference", "fallback"), value);
  }
  assert.equal(removeLocalState("preference"), true);
  assert.equal(readLocalState("preference", "fallback"), "fallback");

  values.set("preference", "incomplete JSON {");
  assert.equal(readLocalState("preference", "fallback"), "fallback");
});

test("blocked storage access and a full quota cannot interrupt navigation actions", (context) => {
  const failure = () => {
    throw new Error("Browser storage unavailable");
  };
  browserStorage(context, {
    localStorage: { getItem: failure, setItem: failure, removeItem: failure },
  });

  assert.equal(readLocalState("preference", "fallback"), "fallback");
  assert.equal(writeLocalState("preference", { deckId: 14 }), false);
  assert.equal(removeLocalState("preference"), false);
});

test("storage getters denied by browser policy are handled inside the fallback", (context) => {
  browserStorage(context, {
    get localStorage() {
      throw new Error("Storage access denied");
    },
  });

  assert.equal(readLocalState("preference", false), false);
  assert.equal(writeLocalState("preference", true), false);
  assert.equal(removeLocalState("preference"), false);
});
