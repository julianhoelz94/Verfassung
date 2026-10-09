import { createServer as createHttpServer } from 'node:http';
import { isIP } from 'node:net';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createServer } from './server.js';

const handler = toNodeHandler(createMcpHandler(ctx => createServer(ctx.requestInfo?.headers.get('authorization') ?? undefined), { maxRequestBodySize: 5 * 1024 * 1024 }), { maxRequestBodySize: 5 * 1024 * 1024 });
const port = Number(process.env.PORT ?? '8080');
const allowedOrigin = new URL(process.env.PUBLIC_BASE_URL ?? 'http://localhost').origin;
const windows = new Map<string, { expiresAt: number; count: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (windows.size > 10_000) {
    for (const [key, value] of windows) if (value.expiresAt <= now) windows.delete(key);
  }
  const window = windows.get(ip);
  if (!window || window.expiresAt <= now) {
    windows.set(ip, { expiresAt: now + 60_000, count: 1 });
    return false;
  }
  window.count += 1;
  return window.count > 120;
}

createHttpServer((request, response) => {
  if (request.url === '/mcp/ping' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('ok');
    return;
  }
  if (request.url !== '/mcp') {
    response.writeHead(404).end();
    return;
  }
  if (request.headers.origin && request.headers.origin !== allowedOrigin) {
    response.writeHead(403).end();
    return;
  }
  const forwarded = request.headers['x-atlas-client-ip'];
  const candidate = typeof forwarded === 'string' ? forwarded : '';
  const ip = isIP(candidate) ? candidate : request.socket.remoteAddress ?? 'unknown';
  if (rateLimited(ip)) {
    response.writeHead(429, { 'Retry-After': '60' }).end();
    return;
  }
  void handler(request, response);
}).listen(port, '0.0.0.0');
