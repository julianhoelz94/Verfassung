import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getJson, postJson, UpstreamError } from './catalog.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('malformed upstream error details retain their status and safe fallback', async () => {
  for (const body of ['null', '{"detail":123}', '<html>unavailable</html>']) {
    globalThis.fetch = async () => new Response(body, { status: 400 });
    await assert.rejects(getJson('catalog', '/countries'), (error: unknown) => {
      assert.ok(error instanceof UpstreamError);
      assert.equal(error.status, 400);
      assert.equal(error.message, 'The submitted content needs correction.');
      return true;
    });
  }
});

test('write transport preserves authorization and idempotency without retrying', async () => {
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer key');
    assert.equal(new Headers(init.headers).get('Idempotency-Key'), 'attempt-1');
    assert.equal(init.body, '{"title":"Draft"}');
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ id: 'draft-1' });
  };
  assert.deepEqual(await postJson('ingestion', '/import-jobs', { title: 'Draft' }, 'Bearer key', 'attempt-1'), { id: 'draft-1' });
  assert.equal(calls, 1);
});
