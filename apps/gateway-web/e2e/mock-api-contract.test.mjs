import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

let child;
let origin;
const authorization = "Bearer e2e-session-token";

/** Reserve a temporary loopback port without relying on fixed browser-suite ports. */
async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

/** Start either implementation so the same public contracts can characterize the original. */
before(async () => {
  const port = await availablePort();
  origin = `http://127.0.0.1:${port}`;
  const entry =
    process.env.MOCK_API_TEST_ENTRY ??
    fileURLToPath(new URL("./mock-api.mjs", import.meta.url));
  child = spawn(process.execPath, [entry], {
    env: { ...process.env, E2E_MOCK_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Mock startup timed out: ${errors}`)),
      10_000,
    );
    child.stdout.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Mock exited ${code}: ${errors}`));
    });
  });
});

/** Always release the child server, including a failed assertion or startup failure. */
after(async () => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
});

/** Read public HTTP output without importing handler internals or fixture state. */
async function request(path, method = "GET", body, token) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: token } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : undefined,
  };
}

beforeEach(async () => {
  assert.equal((await request("/__reset", "POST")).status, 204);
});

test("health precedes method routing and JSON/fallback responses retain their wire contract", async () => {
  const health = await request("/health", "PATCH");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true });
  assert.equal(health.headers.get("content-type"), "application/json");
  assert.equal(
    health.headers.get("content-length"),
    String(Buffer.byteLength(JSON.stringify(health.body))),
  );
  const missing = await request("/missing?ignored=1", "DELETE");
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "unhandled DELETE /missing" });
});

test("malformed JSON remains an empty login payload and unknown legal methods fall through", async () => {
  const response = await fetch(`${origin}/api/identity/login`, {
    method: "POST",
    body: "{",
  });
  // The historical mock compares the two missing credential fields as undefined.
  assert.equal(response.status, 200);
  const login = await response.json();
  assert.equal(login.token, "e2e-session-token");
  assert.equal(login.user.email, undefined);
  const unsupported = await request(
    "/api/document/legal-pages/impressum",
    "DELETE",
  );
  assert.equal(unsupported.status, 404);
  assert.deepEqual(unsupported.body, {
    error: "unhandled DELETE /api/document/legal-pages/impressum",
  });
});

test("reset replaces identity and credential state seen by later handlers", async () => {
  const initial = await request(
    "/api/identity/me",
    "GET",
    undefined,
    authorization,
  );
  assert.equal(
    (
      await request("/api/identity/login", "POST", {
        email: "local-viewer@example.local",
        password: "change-me",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/identity/me/language",
        "PUT",
        { languagePreference: "de" },
        authorization,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/identity/password/change", "POST", {
        currentPassword: "change-me",
        newPassword: "replacement",
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await request("/api/identity/login", "POST", {
        email: "local-viewer@example.local",
        password: "change-me",
      })
    ).status,
    401,
  );
  assert.equal((await request("/__reset", "POST")).status, 204);
  assert.deepEqual(
    (await request("/api/identity/me", "GET", undefined, authorization)).body,
    initial.body,
  );
  assert.equal(
    (
      await request("/api/identity/login", "POST", {
        email: "local-viewer@example.local",
        password: "change-me",
      })
    ).status,
    200,
  );
});

test("legal writes retain text-before-contact conflict precedence and atomic shared publication", async () => {
  const draftPath = "/api/document/legal-pages/impressum/draft";
  const denied = await request(
    "/api/document/legal-pages/imprint-details/draft",
    "PUT",
    { expectedRevision: 0 },
  );
  assert.deepEqual(denied.body, { error: "Login required" });
  const stale = await request(draftPath, "PUT", {
    expectedRevision: 0,
    content: "text",
    contact: { expectedRevision: 0 },
  });
  assert.deepEqual(stale.body, { error: "Conflict" });
  const contact = await request(draftPath, "PUT", {
    expectedRevision: 1,
    content: "text",
    contact: { expectedRevision: 0 },
  });
  assert.deepEqual(contact.body, { error: "Contact changed" });
  const saved = await request(draftPath, "PUT", {
    expectedRevision: 1,
    content: "  Updated text  ",
    contact: { expectedRevision: 1, name: "Updated publisher" },
  });
  assert.equal(saved.body.draft.revision, 2);
  assert.equal(saved.body.draft.content, "Updated text");
  const publishPath = "/api/document/legal-pages/impressum/publish";
  assert.deepEqual(
    (
      await request(publishPath, "POST", {
        expectedRevision: 2,
        expectedContactRevision: 1,
      })
    ).body,
    { error: "Contact changed" },
  );
  assert.equal(
    (
      await request(publishPath, "POST", {
        expectedRevision: 2,
        expectedContactRevision: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/document/legal-pages/impressum")).body.content,
    "Updated text",
  );
  assert.equal(
    (await request("/api/document/legal-pages/imprint-details")).body.name,
    "Updated publisher",
  );
});

test("editor saves replace an article and publication refreshes the original amendment pins", async () => {
  const session = await request("/api/editor/edit-sessions", "POST", {});
  const path = `/api/editor/edit-sessions/${session.body.id}`;
  await request(`${path}/saves`, "POST", {
    articleId: "article",
    body: "first",
  });
  await request(`${path}/saves`, "POST", {
    articleId: "article",
    body: "replacement",
  });
  const preview = await request(path);
  assert.equal(preview.body.session.revisionCount, 2);
  assert.deepEqual(preview.body.drafts, [
    { articleId: "article", body: "replacement" },
  ]);
  assert.equal(
    (
      await request(`${path}/publish`, "POST", {
        hopKind: "editorial_correction",
      })
    ).body.session.status,
    "published",
  );
  const amendments = await request(
    "/api/amendment/constitutions/01900000-0000-4000-8000-000000000002/amendments?status=all",
  );
  assert.equal(amendments.body[0].reviewStatus, "needs_review");
  assert.equal((await request("/__reset", "POST")).status, 204);
  assert.equal((await request(path)).status, 404);
});

test("import failure and archive state remain observable until reset replaces the job map", async () => {
  const staged = await request("/api/ingestion/import-jobs", "POST", {
    articles: [{ articleNumber: "1", body: "Exact text" }],
  });
  const path = `/api/ingestion/import-jobs/${staged.body.id}`;
  assert.equal(
    (await request(`${path}/archive`, "POST", { archived: true })).status,
    409,
  );
  assert.equal(
    (await request(`${path}/prepare`, "POST")).body.versionId,
    "01900000-0000-4000-8000-000000000705",
  );
  assert.equal(
    (await request(`${path}/approve`, "POST", { reason: "Reviewed source" }))
      .body.status,
    "approved",
  );
  await request("/__import_publication_error", "POST", {
    code: "delivery_unavailable",
  });
  assert.deepEqual((await request(`${path}/publish`, "POST")).body, {
    code: "delivery_unavailable",
  });
  assert.equal((await request(path)).body.status, "approved");
  await request("/__import_publication_error", "POST", {});
  assert.equal(
    (await request(`${path}/publish`, "POST")).body.status,
    "completed",
  );
  assert.equal(
    (await request(`${path}/archive`, "POST", { archived: true })).status,
    204,
  );
  assert.equal(
    (await request("/api/ingestion/import-jobs?archived=true")).body.length,
    1,
  );
  await request("/__reset", "POST");
  assert.equal((await request(path)).status, 404);
});
