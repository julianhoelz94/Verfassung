import { createServer } from "node:http";
import { routes } from "./mock-api/routes.mjs";
import { json, port, resetMockState } from "./mock-api/state.mjs";

resetMockState();

/** Dispatch in source order without awaiting synchronous misses or reading unmatched bodies. */
async function serveMockRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const { pathname, searchParams } = url;
  const method = req.method ?? "GET";
  const context = { req, res, url, pathname, searchParams, method };
  for (const route of routes) {
    const result = route(context);
    if (result instanceof Promise ? await result : result) return;
  }
  json(res, 404, { error: `unhandled ${method} ${pathname}` });
}

const server = createServer(serveMockRequest);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`e2e mock api on http://127.0.0.1:${port}\n`);
});
