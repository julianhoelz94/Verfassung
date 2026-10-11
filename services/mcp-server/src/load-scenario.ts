import { performance } from 'node:perf_hooks';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from './server.js';

const requests = Number(process.env.MCP_LOAD_REQUESTS ?? 400);
const concurrency = Number(process.env.MCP_LOAD_CONCURRENCY ?? 8);
const corpusSize = Number(process.env.MCP_LOAD_CONSTITUTIONS ?? 5_000);
if (![requests, concurrency, corpusSize].every(Number.isSafeInteger) || requests < 1 || requests > 10_000 || concurrency < 1 || concurrency > 32 || corpusSize < 100 || corpusSize > 50_000) {
  throw new Error('Invalid load scenario size');
}

const originalFetch = globalThis.fetch;
const originalInfo = console.info;
console.info = () => {};
const constitutions = Array.from({ length: corpusSize }, (_, n) => ({ id: `01900000-0000-4000-8000-${String(n).padStart(12, '0')}`, slug: `constitution-${n}`, title: `Constitution ${n}`, versions: [{}] }));
globalThis.fetch = async input => {
  const url = new URL(String(input));
  if (url.pathname === '/countries/DE') return Response.json({ isoCode: 'DE', name: 'Germany', constitutions });
  return Response.json({ scopes: ['mcp:read'], id: 'load-actor' });
};

const handler = createMcpHandler(ctx => createServer(ctx.requestInfo?.headers.get('authorization') ?? undefined));
const durations: number[] = [];
let next = 0;
let errors = 0;
const call = async () => {
  const start = performance.now();
  const request = new Request('http://localhost/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ca_mcp_load', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'list_constitutions' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_constitutions', arguments: { countryCode: 'DE', limit: 50 }, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } }),
  });
  const response = await handler.fetch(request);
  const body = await response.json() as { result?: { isError?: boolean; structuredContent?: { constitutions?: unknown[] } } };
  durations.push(performance.now() - start);
  if (!response.ok || body.result?.isError || body.result?.structuredContent?.constitutions?.length !== 50) errors += 1;
};

const started = performance.now();
try {
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < requests) { next += 1; await call(); }
  }));
} finally { globalThis.fetch = originalFetch; console.info = originalInfo; }
const elapsed = (performance.now() - started) / 1000;
durations.sort((a, b) => a - b);
const percentile = (p: number) => Math.round(durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)] ?? 0);
const result = { corpusSize, requests, concurrency, errors, throughputPerSecond: Math.round(requests / elapsed), p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99) };
process.stdout.write(`${JSON.stringify(result)}\n`);
if (errors || result.p95Ms > 2_000 || result.throughputPerSecond < 10) process.exitCode = 1;
