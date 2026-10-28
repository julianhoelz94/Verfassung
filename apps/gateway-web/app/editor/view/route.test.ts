// EDIT-1: broader-outline navigation never publishes or fetches unrelated full trees.
// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorApiError, getStructuredDraft } from '../../../lib/editor-api';
import { getVersionSettings } from '../../../lib/api';
import type { StructuredPreview } from '../../../lib/structured-editor';
import { GET } from './route';
vi.mock('../../../lib/editor-api', async original => ({ ...await original<typeof import('../../../lib/editor-api')>(), getStructuredDraft: vi.fn() }));
vi.mock('../../../lib/api', async original => ({ ...await original<typeof import('../../../lib/api')>(), getVersionSettings: vi.fn() }));
const preview: StructuredPreview = { sessionId: 'session', sourceVersionId: 'published-source', sourceGeneration: 1, generation: 2, settingsRevisionId: 'settings-r1', operations: [], roots: [{ logicalId: 'article-1', kind: 'article', title: 'First', content: [{ type: 'text', logicalId: 'preface', text: 'Authored parent text' }, { type: 'child', node: { logicalId: 'paragraph-1', kind: 'paragraph', content: [{ type: 'text', text: 'Detailed guarantee' }] } }] }, { logicalId: 'article-2', kind: 'article', title: 'Second', content: [{ type: 'text', text: 'Other guarantee' }] }], sourceRoots: [] };
const request = (query: string) => new NextRequest('https://atlas.example/editor/view?' + query);
beforeEach(() => {
  vi.mocked(getStructuredDraft).mockResolvedValue({ ...preview, sourceRoots: preview.roots });
  vi.mocked(getVersionSettings).mockResolvedValue({ id: 'settings-r1', predecessorId: null, outline: { kinds: ['article', 'paragraph'].map((kindCode, index) => ({ kindCode, displayLabel: kindCode, sortOrder: index, mayHoldText: true, mayHoldChildren: index === 0, allowedChildKinds: index === 0 ? ['paragraph'] : [], presentation: 'section', showLabel: true, showKind: true, showTitle: true })) } });
});
afterEach(() => vi.clearAllMocks());
describe('outline projection contract', () => {
  it('requires a session identifier before requesting any draft', async () => { expect((await GET(request(''))).status).toBe(400); expect(getStructuredDraft).not.toHaveBeenCalled(); });
  it('returns only top-level metadata for a constitution overview', async () => {
    const result = await GET(request('sessionId=session&scope=constitution')); const data = await result.json(); expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('no-store'); expect(data.roots.map((root: { content: unknown[] }) => root.content)).toEqual([[], []]); expect(data.generation).toBe(2);
  });
  it('keeps the selected root complete and other roots collapsed', async () => {
    const result = await GET(request('sessionId=session&rootId=article-1')); const data = await result.json(); expect(data.roots[0]).toEqual(preview.roots[0]); expect(data.roots[1].content).toEqual([]); expect(data.sourceRoots[0]).toEqual(preview.roots[0]);
  });
  it('projects a level while preserving the identity of its nested units', async () => {
    const data = await (await GET(request('sessionId=session&scope=paragraph'))).json(); expect(data.roots[0].content).toHaveLength(1); expect(data.roots[0].content[0].node).toMatchObject({ logicalId: 'paragraph-1', content: [] });
  });
  it.each([['rootId=unknown', 404, 'root_not_found'], ['scope=unknown', 400, 'invalid_scope']])('rejects an unknown selection %s', async (selection, status, error) => {
    const result = await GET(request(`sessionId=session&${selection}`)); expect(result.status).toBe(status); expect(await result.json()).toEqual({ error });
  });
  it('distinguishes missing drafts from unavailable structural settings', async () => {
    vi.mocked(getStructuredDraft).mockResolvedValueOnce(null); expect((await GET(request('sessionId=missing'))).status).toBe(404);
    vi.mocked(getVersionSettings).mockResolvedValue(null); expect((await GET(request('sessionId=session&scope=constitution'))).status).toBe(503);
  });
  it.each([['sign_in', 401], ['forbidden', 403]] as const)('preserves a %s rejection without returning draft content', async (key, status) => {
    vi.mocked(getStructuredDraft).mockRejectedValue(new EditorApiError(key)); const result = await GET(request('sessionId=session&scope=constitution')); expect(result.status).toBe(status); expect(await result.json()).toEqual({ error: key });
  });
});
