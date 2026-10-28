// EDIT-1/API-1: ADR 0005, hierarchical diff review, Amendment controller contract.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import * as api from './amendment-editor-api';
import { cookieJar, json } from '../test/server-boundary';
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
let jar: ReturnType<typeof cookieJar>;
beforeEach(() => { jar = cookieJar({ ca_session: 'staff-session' }); vi.mocked(cookies).mockResolvedValue(jar as unknown as Awaited<ReturnType<typeof cookies>>); });
afterEach(() => vi.restoreAllMocks());
const draft = { title: 'Voting reform', comment: 'Official change', sourceVersionId: 'before', targetVersionId: 'after', changes: [] };

describe('legal-change commands and review guards', () => {
  const commands = [
    { name: 'create draft', run: () => api.createAmendment('charter/id', draft), path: '/constitutions/charter%2Fid/amendments', body: draft },
    { name: 'append revision', run: () => api.appendRevision('law/id', draft), path: '/amendments/law%2Fid/revisions', body: draft },
    { name: 'publish reviewed draft', run: () => api.publishAmendment('law/id'), path: '/amendments/law%2Fid/publish' },
    { name: 'confirm quoted snapshots', run: () => api.confirmAmendmentQuotes('law/id'), path: '/amendments/law%2Fid/confirm-quotes' },
    { name: 'withdraw record', run: () => api.withdrawAmendment('law/id'), path: '/amendments/law%2Fid/withdraw' },
    { name: 'preview suggestions without publication', run: () => api.suggestChanges({ sourceVersionId: 'before', targetVersionId: 'after' }), path: '/amendments/suggest', body: { sourceVersionId: 'before', targetVersionId: 'after' } },
  ];
  for (const command of commands) {
    it(`uses the distinct ${command.name} command`, async () => {
      const result = { id: 'law', status: 'draft', title: 'Voting reform' }; const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(result));
      expect(await command.run()).toEqual(result); expect(new URL(String(upstream.mock.calls[0][0])).pathname).toBe('/api/amendment' + command.path); expect(upstream.mock.calls[0][1]).toMatchObject({ method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer staff-session' } });
      expect(upstream.mock.calls[0][1]?.body).toBe(command.body ? JSON.stringify(command.body) : undefined);
    });
    it(`${command.name} cannot run anonymously`, async () => {
      jar.values.clear(); const upstream = vi.spyOn(globalThis, 'fetch'); await expect(command.run()).rejects.toMatchObject({ key: 'sign_in' }); expect(upstream).not.toHaveBeenCalled();
    });
  }
  it.each([[401, 'sign_in'], [403, 'forbidden'], [404, 'not_found'], [400, 'invalid'], [409, 'publish_failed']])('preserves HTTP %s rejection as %s without retrying', async (status, key) => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ code: 'not_editorial_tip' }, Number(status))); await expect(api.publishAmendment('law')).rejects.toMatchObject({ key, code: 'not_editorial_tip' }); expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('handles a non-JSON rejection without trusting its HTML as user-facing text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>upstream failed</html>', { status: 503 })); await expect(api.publishAmendment('law')).rejects.toMatchObject({ key: 'publish_failed' });
    expect(api.amendmentErrorMessage('<script>arbitrary</script>')).not.toContain('<script>'); expect(api.amendmentErrorMessage(undefined)).toBeNull();
  });
  it('distinguishes missing records and unauthorized private history', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({}, 404)); expect(await api.getAmendment('missing')).toBeNull();
    upstream.mockImplementation(async () => json({}, 403)); expect(await api.listRevisions('private')).toBeNull(); jar.values.clear(); expect(await api.listRevisions('private')).toBeNull();
  });
  it('reads draft history and diff review with the caller bearer', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => json(String(input).endsWith('/revisions') ? [{ id: 'revision-1', title: 'Original' }] : { revisionId: 'revision-1', candidates: [] }));
    expect(await api.listRevisions('law')).toEqual([{ id: 'revision-1', title: 'Original' }]); expect(await api.getAmendmentDiffReview('law')).toEqual({ revisionId: 'revision-1', candidates: [] });
    expect(upstream.mock.calls.every(([, options]) => new Headers(options?.headers).get('Authorization') === 'Bearer staff-session')).toBe(true);
  });
  it('pins a diff decision to both the reviewed revision and candidate fingerprint', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ revisionId: 'revision-1', candidates: [] }));
    await api.decideAmendmentDiff('law/id', 'revision-1', { key: 'candidate-1', fingerprint: 'content-hash', status: 'excluded', exclusionReason: 'Formatting only; no legal change.' });
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ expectedRevisionId: 'revision-1', key: 'candidate-1', fingerprint: 'content-hash', status: 'excluded', linkedChangeIds: [], exclusionReason: 'Formatting only; no legal change.', reviewerAcknowledged: false });
  });
});
