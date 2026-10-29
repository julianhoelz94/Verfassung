import assert from 'node:assert/strict';
import test from 'node:test';
import { importPayloadSchema, orderedNode, outlineSchema } from './import-schema.js';

test('source evidence accepts a free description and preserves legacy imports', () => {
  const schema = importPayloadSchema.shape.sourceEvidence;
  const description = '# Official source\n\n[Archive](https://example.org)\n\nEditorial source description';
  assert.deepEqual(schema.parse({ description }), { description });
  assert.deepEqual(schema.parse({ attribution: 'Legacy archive', coverage: 'Excerpt' }), { attribution: 'Legacy archive', coverage: 'Excerpt' });
  assert.equal(schema.safeParse({ description: 'x'.repeat(50_001) }).success, false);
});

test('strict import transport preserves inline marks and cursor footnote references', () => {
  const node = { kind: 'clause', content: [{ type: 'text', text: 'Exact wording.', marks: [{ type: 'bold', start: 0, end: 5 }, { type: 'italic', start: 0, end: 5 }], references: [{ logicalId: '01900000-0000-4000-8000-000000000001', start: 14, end: 14, target: { type: 'footnote', footnoteId: '01900000-0000-4000-8000-000000000002' } }] }] };
  assert.deepEqual(orderedNode.parse(node), node);
  assert.equal(orderedNode.safeParse({ ...node, content: [{ ...node.content[0], marks: [{ type: 'script', start: 0, end: 5 }] }] }).success, false);
  assert.equal(orderedNode.safeParse({ ...node, content: [{ ...node.content[0], marks: [{ type: 'bold', start: 5, end: 0 }] }] }).success, false);
});

test('automatic sentence settings retain Unicode sequences and reject nonleaf or empty configurations', () => {
  const leaf = { kindCode: 'clause', displayLabel: 'Clause', segmentation: 'sentence', sentenceDelimiters: [';', '。', '?!'], allowedChildKinds: [] };
  assert.deepEqual(outlineSchema.parse({ kinds: [leaf] }), { kinds: [leaf] });
  assert.equal(outlineSchema.safeParse({ kinds: [{ ...leaf, sentenceDelimiters: [] }] }).success, false);
  assert.equal(outlineSchema.safeParse({ kinds: [{ ...leaf, sentenceDelimiters: ['word'] }] }).success, false);
  assert.equal(outlineSchema.safeParse({ kinds: [{ ...leaf, sentenceDelimiters: ['.', '.'] }] }).success, false);
  assert.equal(outlineSchema.safeParse({ kinds: [{ ...leaf, labelPolicy: 'required' }] }).success, false);
  assert.equal(outlineSchema.safeParse({ kinds: [{ ...leaf, titlePolicy: 'required' }] }).success, false);
  assert.equal(outlineSchema.safeParse({ kinds: [{ ...leaf, allowedChildKinds: ['child'] }, { kindCode: 'child', displayLabel: 'Child' }] }).success, false);
});

test('authored separators roundtrip outside text and reject fractional or unbounded counts', () => {
  const entry = { type: 'text', text: 'Exact wording.', lineBreaksBefore: 2 };
  const node = { kind: 'clause', content: [entry] };
  assert.deepEqual(orderedNode.parse(node), node);
  for (const lineBreaksBefore of [-1, 17, 1.5, '2', null]) {
    assert.equal(orderedNode.safeParse({ ...node, content: [{ ...entry, lineBreaksBefore }] }).success, false);
  }
  const legacy = { kind: 'clause', content: [{ type: 'text', text: 'Exact wording.' }] };
  assert.deepEqual(orderedNode.parse(legacy), legacy);
});
