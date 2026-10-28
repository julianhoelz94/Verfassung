import assert from 'node:assert/strict';
import test from 'node:test';
import { importPayloadSchema } from './import-schema.js';

test('source evidence accepts a free description and preserves legacy imports', () => {
  const schema = importPayloadSchema.shape.sourceEvidence;
  const description = '# Official source\n\n[Archive](https://example.org)\n\nEditorial source description';
  assert.deepEqual(schema.parse({ description }), { description });
  assert.deepEqual(schema.parse({ attribution: 'Legacy archive', coverage: 'Excerpt' }), { attribution: 'Legacy archive', coverage: 'Excerpt' });
  assert.equal(schema.safeParse({ description: 'x'.repeat(50_001) }).success, false);
});
