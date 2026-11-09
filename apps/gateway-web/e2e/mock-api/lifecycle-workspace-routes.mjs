import { randomUUID } from 'node:crypto';
import { json, mockState, readBody } from './state.mjs';

// Opt-in fixture for browser tests of actual Server Actions; never intercepts ordinary journeys.
export async function handleLifecycleWorkspace({ req, res, pathname, method }) {
  if (pathname === '/__lifecycle_workspace' && method === 'POST') {
    const { fail = false } = await readBody(req);
    mockState.lifecycleWorkspace ??= { events: [], provisions: [], receipts: new Map() };
    mockState.lifecycleWorkspace.fail = fail;
    json(res, 200, { ok: true }); return true;
  }
  const state = mockState.lifecycleWorkspace;
  const match = pathname.match(/^\/api\/catalog\/constitutions\/([^/]+)\/(lifecycle-events|provision-events)$/);
  if (!state || !match) return false;
  const events = match[2] === 'lifecycle-events' ? state.events : state.provisions;
  if (method === 'GET') { json(res, 200, events); return true; }
  if (method !== 'POST') return false;
  const body = await readBody(req);
  if (state.fail) { json(res, 503, { error: 'unavailable' }); return true; }
  const event = state.receipts.get(body.operationId) ?? { ...body, id: randomUUID(), constitutionId: match[1], sourceUrl: body.sourceUrl ?? null, note: body.note ?? null };
  if (!state.receipts.has(body.operationId)) { events.push(event); state.receipts.set(body.operationId, event); }
  json(res, 201, event); return true;
}
