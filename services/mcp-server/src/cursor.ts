import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const secret = process.env.MCP_CURSOR_SECRET || randomBytes(32).toString('hex');
const ttlMs = 15 * 60 * 1000;

type State = { scope: string; fingerprint: string; next: number; expiresAt: number };
export class CursorError extends Error {}

function signature(payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function fingerprint(values: string[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export function encodeCursor(scope: string, sourceFingerprint: string, next: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ scope, fingerprint: sourceFingerprint, next, expiresAt: now + ttlMs } satisfies State)).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}

export function decodeCursor(cursor: string, scope: string, sourceFingerprint: string, now = Date.now()): number {
  const [payload, mac, extra] = cursor.split('.');
  if (!payload || !mac || extra || cursor.length > 1024) throw new CursorError('Invalid cursor');
  const received = Buffer.from(mac, 'base64url');
  const expected = signature(payload);
  if (received.toString('base64url') !== mac || received.length !== expected.length || !timingSafeEqual(received, expected)) throw new CursorError('Invalid cursor');
  let state: State;
  try { state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as State; }
  catch { throw new CursorError('Invalid cursor'); }
  if (state.scope !== scope || !Number.isSafeInteger(state.next) || state.next < 0) throw new CursorError('Invalid cursor');
  if (state.expiresAt <= now) throw new CursorError('Expired cursor');
  if (state.fingerprint !== sourceFingerprint) throw new CursorError('Collection changed; restart pagination');
  return state.next;
}
