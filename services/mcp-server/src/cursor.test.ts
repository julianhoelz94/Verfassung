import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeCursor, encodeCursor, fingerprint } from './cursor.js';

test('cursor pins scope and collection across pages', () => {
  const source = fingerprint(['a', 'b', 'c']);
  const cursor = encodeCursor('countries', source, 2, 1_000);
  assert.equal(decodeCursor(cursor, 'countries', source, 2_000), 2);
  assert.throws(() => decodeCursor(cursor, 'versions', source, 2_000), /Invalid cursor/);
  assert.throws(() => decodeCursor(cursor, 'countries', fingerprint(['a', 'b', 'c', 'd']), 2_000), /Collection changed/);
  assert.throws(() => decodeCursor(cursor, 'countries', source, 1_000 + 15 * 60 * 1000), /Expired cursor/);
  assert.throws(() => decodeCursor(cursor.slice(0, -1) + 'x', 'countries', source, 2_000), /Invalid cursor/);
});
