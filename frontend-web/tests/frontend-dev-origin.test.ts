import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createServer, type ViteDevServer } from "vite";

test("Vite's actual development module ignores an inherited direct-Flask API origin", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const previousBase = process.env.VITE_CARDFIGHT_API_URL;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  process.env.VITE_CARDFIGHT_API_URL = "http://127.0.0.1:5000";
  const requests: { url: string; credentials: RequestCredentials | undefined }[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost:5173" } } });
  globalThis.fetch = (async (url, options) => {
    requests.push({ url: String(url), credentials: options?.credentials });
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  let server: ViteDevServer | undefined;
  try {
    server = await createServer({ root, configFile: false, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
    const transformed = await server.transformRequest("/src/api/client.ts");
    assert.ok(transformed);
    // This is Vite's injected environment, including the problematic inherited
    // value; execute its transformed module rather than duplicating the ternary.
    assert.match(transformed.code, /http:\/\/127\.0\.0\.1:5000/);
    const transportUrl = pathToFileURL(path.join(root, "src/api/transport.ts")).href;
    const executable = transformed.code.replaceAll('"/src/api/transport.ts"', JSON.stringify(transportUrl));
    const client = await import(`data:text/javascript;base64,${Buffer.from(executable).toString("base64")}`);
    assert.deepEqual(await client.apiRequest("/api/auth/session"), { ok: true });
    assert.equal(client.apiAssetUrl("/api/card-images/fixture/full"), "/api/card-images/fixture/full");
    assert.deepEqual(requests, [{ url: "/api/auth/session", credentials: "same-origin" }]);
  } finally {
    await server?.close();
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousBase === undefined) delete process.env.VITE_CARDFIGHT_API_URL;
    else process.env.VITE_CARDFIGHT_API_URL = previousBase;
  }
});
