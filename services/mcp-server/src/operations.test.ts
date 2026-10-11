import assert from 'node:assert/strict';
import test from 'node:test';
import { enter, metrics, observeTool } from './operations.js';

test('MCP concurrency budget is per actor and global, and releases on close', () => {
  const releases = Array.from({ length: 8 }, () => enter('actor-a'));
  assert.ok(releases.every(Boolean));
  assert.equal(enter('actor-a'), null);
  const other = enter('actor-b');
  assert.ok(other);
  releases[0]?.();
  assert.ok(enter('actor-a'));
  releases.forEach(release => release?.());
  other?.();
});

test('internal metrics expose bounded tool labels and duration buckets', () => {
  observeTool('list_countries', 'ok', 12);
  const body = metrics();
  assert.match(body, /mcp_tool_calls_total\{tool="list_countries",outcome="ok"\} 1/);
  assert.match(body, /mcp_tool_duration_ms_bucket\{tool="list_countries",outcome="ok",le="50"\} 1/);
});
